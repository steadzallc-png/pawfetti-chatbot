import "dotenv/config";
import { searchCatalog, searchPolicies } from "./storefront-mcp-client.js";
import { searchCatalogCsv } from "./catalog-csv.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

/** When "true" or "1", use MCP + Groq. Otherwise use CSV catalog only (no MCP, no Groq). */
const USE_GROQ_MCP = process.env.USE_GROQ_MCP === "true" || process.env.USE_GROQ_MCP === "1";

const BASE_URL = "https://pawfetti.steadza.com";
const PAGES = {
  contact: `${BASE_URL}/pages/contact-us`,
  faq: `${BASE_URL}/pages/faq`,
  shipping: `${BASE_URL}/pages/shipping-handling`,
  refund: `${BASE_URL}/policies/refund-policy`,
};

/** Maximum MCP tool invocations per chat turn. We only use catalog + policies (2 tools). */
const MAX_MCP_TOOL_CALLS = 2;
/** Max assistant replies per session when using AI (Groq); not applied in CSV-only mode. */
const MAX_AI_TURNS = 3;

/**
 * If the message is a policy/customer-service question, return a reply with direct links.
 * Otherwise return null so Gemini handles it.
 */
function getPolicyResponse(message) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower) return null;

  const hasRefund = /\b(refund|refunds|return|returns|exchange)\b/.test(lower);
  const hasShipping = /\b(shipping|delivery|deliver|when will i get|how long.*ship|ship time|tracking)\b/.test(lower);
  const hasOrderStatus = /\b(where is my order|order status|track my order|when will.*arrive)\b/.test(lower);
  const hasFaq = /\b(faq|frequently asked|common questions)\b/.test(lower);
  const hasContact = /\b(contact|reach|speak to|talk to|customer service|help me)\b/.test(lower);
  const hasPolicy = /\b(policy|policies)\b/.test(lower);

  // Refund / return
  if (hasRefund) {
    return `For refunds and returns, please see our Refund Policy: ${PAGES.refund}\n\nIf you have already submitted a return and want to check on it, or have more questions, reach out via our Contact page: ${PAGES.contact}`;
  }

  // Shipping / delivery time
  if (hasShipping) {
    return `For shipping times and delivery information, see our Shipping & Handling page: ${PAGES.shipping}\n\nFor order-specific questions (e.g. tracking), please use our Contact page: ${PAGES.contact}`;
  }

  // Order status / tracking
  if (hasOrderStatus) {
    return `To check on your order or get tracking information, please contact us through our Contact page. Our team will help you with the status of your order: ${PAGES.contact}`;
  }

  // General policy or FAQ
  if (hasFaq) {
    return `You can find answers to common questions on our FAQs page: ${PAGES.faq}\n\nFor anything else, use our Contact page: ${PAGES.contact}`;
  }

  if (hasContact) {
    return `You can reach us through our Contact page: ${PAGES.contact}`;
  }

  if (hasPolicy) {
    return `Here are our main policy pages:\n\n• Refund Policy: ${PAGES.refund}\n• Shipping & Handling: ${PAGES.shipping}\n• FAQs: ${PAGES.faq}\n\nFor specific questions, use our Contact page: ${PAGES.contact}`;
  }

  return null;
}

/**
 * Generic greetings or very broad questions that don't need MCP or Groq. Return a canned reply with links.
 */
function getGenericResponse(message) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower || lower.length > 120) return null;

  const isGreeting = /^(hi|hello|hey|hiya|howdy)\s*\.?\!?$/i.test(lower) || /^hi\s+there\.?$/i.test(lower);
  const isGenericHelp =
    /^(what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+can\s+you\s+help|help\s*\.?\!?|what\s+are\s+you)\s*\.?\!?$/i.test(lower) ||
    /^(tell\s+me\s+about\s+(the\s+)?store|about\s+(the\s+)?store)\s*\.?\!?$/i.test(lower);

  if (isGreeting || isGenericHelp) {
    return `Hi! I can help with product questions, shipping, returns, and more. Browse our catalog: ${BASE_URL}/collections/all\n\nFor policies and FAQs: ${PAGES.faq}\nTo contact us: ${PAGES.contact}`;
  }

  return null;
}

/** Format CSV search hits into reply text: title, price, and link per product. */
function formatCsvCatalogReply(hits) {
  const lines = hits.map((p) => {
    const priceStr = p.price ? ` ${p.price}` : "";
    return `${p.title}${priceStr}\n${p.url}`;
  });
  return `Here are some products that might match:\n\n${lines.join("\n\n")}\n\nNeed something else? Browse our catalog or contact us: ${PAGES.contact}`;
}

/**
 * MCP returns { content: [ { type: "text", text: "<json string>" } ], isError }.
 * Extract and parse the inner JSON so we get { products, pagination, ... } for catalog.
 */
function parseMcpContent(mcpResult) {
  if (!mcpResult?.content?.[0]?.text) return null;
  try {
    return JSON.parse(mcpResult.content[0].text);
  } catch {
    return null;
  }
}

/**
 * Normalize the user message into a shorter search query for MCP. The store search often
 * returns no results for long questions like "what cat grooming products do you have?"
 * but returns results for "cat grooming products". Strip question wrappers and punctuation.
 */
function normalizeSearchQuery(message) {
  if (!message || typeof message !== "string") return message;
  let q = message.trim().replace(/\?+\.*$/, "").trim();
  const prefixes = [
    /^what\s+/i,
    /^how\s+/i,
    /^can you\s+(show\s+me\s+|find\s+me\s+)?/i,
    /^could you\s+(show\s+me\s+|find\s+me\s+)?/i,
    /^do you have\s+/i,
    /^do you\s+(have\s+)?/i,
    /^show me\s+/i,
    /^i want\s+(to\s+see\s+)?/i,
    /^i('m| am)\s+looking for\s+/i,
    /^tell me\s+(about\s+)?/i,
    /^get me\s+/i,
  ];
  for (const re of prefixes) {
    q = q.replace(re, "").trim();
  }
  const suffixes = [
    /\s+do you have\s*$/i,
    /\s+do you sell\s*$/i,
    /\s+can you show\s+(me\s+)?\s*$/i,
    /\s+are there\s*$/i,
    /\s+for me\s*$/i,
    /\s+please\s*$/i,
    /\s+thanks\.?\s*$/i,
    /\s+thank you\.?\s*$/i,
  ];
  for (const re of suffixes) {
    q = q.replace(re, "").trim();
  }
  q = q.replace(/\s+/g, " ").trim();
  return q || message;
}

/**
 * Collect all valid product URLs from enriched catalog (flatten any structure).
 * Returns a Set of normalized URLs for allowlist checks.
 */
function getProductUrlAllowlist(enrichedCatalog) {
  const base = BASE_URL.replace(/\/$/, "").toLowerCase();
  const allowed = new Set();
  function collect(obj) {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(collect);
      return;
    }
    if (typeof obj === "object") {
      const url = obj.productUrl ?? obj.url ?? obj.link;
      if (url && typeof url === "string") {
        const norm = url.trim().toLowerCase().replace(/\/$/, "");
        if (norm.startsWith(base + "/products/")) allowed.add(norm);
      }
      Object.values(obj).forEach(collect);
    }
  }
  collect(enrichedCatalog);
  return allowed;
}

/**
 * Remove from the reply any product URL that is not in the allowlist (stops hallucinated links).
 * If allowlist is empty, strip all product URLs so we never show invented links.
 * Also removes broken phrases left when a URL is stripped (e.g. "the product URL is" with nothing after).
 */
function sanitizeProductLinks(reply, allowedProductUrls) {
  if (!reply) return reply;
  const base = BASE_URL.replace(/\/$/, "");
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const productUrlRegex = new RegExp(`${escapedBase}/products/[^\\s)\\]]+`, "gi");
  let out = reply
    .replace(productUrlRegex, (match) => {
      if (allowedProductUrls.size === 0) return " ";
      const norm = match.trim().toLowerCase().replace(/\/$/, "").replace(/[.,;:)\]}\s]+$/, "");
      return allowedProductUrls.has(norm) ? match : " ";
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/  +/g, " ")
    .trim();
  // Remove broken phrases left when a hallucinated URL was stripped
  out = out
    .replace(/\n*(the product url is|you can find it at|available at|product link:)\s*$/gim, "")
    .replace(/\s*,\s*$/g, "")
    .trim();
  return out;
}

/**
 * Ensure catalog data has product URLs so the model can output them and the UI can show "Open link" buttons.
 * Handles common shapes: { products: [...] }, or array of items. Each item gets productUrl: BASE_URL/products/handle.
 */
function enrichCatalogWithProductUrls(catalogResult) {
  if (!catalogResult || !BASE_URL) return catalogResult;
  const base = BASE_URL.replace(/\/$/, "");
  const addUrl = (item) => {
    if (!item || typeof item !== "object") return item;
    const handle = item.handle ?? item.productHandle;
    const url = item.url ?? item.productUrl ?? item.link;
    const productUrl = url || (handle ? `${base}/products/${handle}` : null);
    return { ...item, productUrl: productUrl || item.productUrl };
  };
  if (Array.isArray(catalogResult)) {
    return catalogResult.map(addUrl);
  }
  if (catalogResult.products && Array.isArray(catalogResult.products)) {
    return { ...catalogResult, products: catalogResult.products.map(addUrl) };
  }
  return addUrl(catalogResult);
}

export async function processChatMessage(message, history, options = {}) {
  const debug = options.debug ? { productTitles: [], allowedUrlCount: 0, rawReply: "" } : null;
  const policyReply = getPolicyResponse(message);
  if (policyReply) return policyReply;

  const genericReply = getGenericResponse(message);
  if (genericReply) return genericReply;

  // CSV-only mode: no MCP, no Groq. Search catalog and return links or "contact us".
  if (!USE_GROQ_MCP) {
    const searchQuery = normalizeSearchQuery(message);
    const hits = searchCatalogCsv(searchQuery, BASE_URL);
    if (debug) {
      debug.productTitles = hits.map((p) => p.title);
      debug.allowedUrlCount = hits.length;
      debug.rawReply = "(CSV mode: no Groq)";
      return {
        reply:
          hits.length > 0
            ? formatCsvCatalogReply(hits)
            : `I couldn't find specific products for that search. You can browse our catalog here: ${BASE_URL}/collections/all\n\nFor help with an order or other questions, contact us: ${PAGES.contact}`,
        debug,
      };
    }
    return hits.length > 0
      ? formatCsvCatalogReply(hits)
      : `I couldn't find specific products for that search. You can browse our catalog here: ${BASE_URL}/collections/all\n\nFor help with an order or other questions, contact us: ${PAGES.contact}`;
  }

  // AI (Groq) path only: enforce 3-reply limit per session; CSV path has no limit
  const aiAssistantTurns = Array.isArray(history) ? history.filter((m) => m && m.role === "assistant").length : 0;
  if (aiAssistantTurns >= MAX_AI_TURNS) {
    const limitMessage =
      "I've already answered a few questions in this session. For more help, please use the Contact us option so a human can assist you.";
    return debug ? { reply: limitMessage, debug } : limitMessage;
  }

  let catalogContext = "";
  let policiesContext = "";
  let allowedProductUrls = new Set();
  let parsedCatalog = null;
  let enriched = null;

  try {
    const searchQuery = normalizeSearchQuery(message);
    const mcpCallSpecs = [
      { key: "catalog", fn: () => searchCatalog(searchQuery) },
      { key: "policies", fn: () => searchPolicies(searchQuery) },
    ].slice(0, MAX_MCP_TOOL_CALLS);

    const results = await Promise.all(mcpCallSpecs.map((s) => s.fn()));
    let catalogResult = null;
    let policiesResult = null;
    mcpCallSpecs.forEach((spec, i) => {
      if (spec.key === "catalog") catalogResult = results[i];
      else if (spec.key === "policies") policiesResult = results[i];
    });

    if (catalogResult) {
      parsedCatalog = parseMcpContent(catalogResult);
      if (parsedCatalog) {
        enriched = enrichCatalogWithProductUrls(parsedCatalog);
        allowedProductUrls = getProductUrlAllowlist(enriched);
        const serialized = JSON.stringify(enriched);
        catalogContext = serialized.slice(0, 6000);
      }
    }

    if (policiesResult) {
      const parsedPolicies = parseMcpContent(policiesResult);
      const serialized = parsedPolicies ? JSON.stringify(parsedPolicies) : JSON.stringify(policiesResult);
      policiesContext = serialized.slice(0, 1500);
    }
  } catch (error) {
    console.error("Error calling Storefront MCP tools:", error);
  }

  const baseInstruction = `You are the Pawfetti pet shop assistant. Be warm, professional, and concise. No emojis.

RULES:
1. You may ONLY recommend products that appear in the "Products you may recommend" list below. Use the exact title and the exact URL from that list. Do not invent or guess any product name or URL.
2. When you recommend a product, you MUST put the product's URL on its own line so the customer gets a clickable link. Format: one line of text, then a blank line, then the URL on the next line.
3. If the customer asks for something not in the list, say we don't have that exact product and suggest they browse the store or contact us. Do not make up products (e.g. no FURminator, Oster, or other brands unless they appear in the list).
4. You cannot add items to the cart. If they ask to add to cart, give them the product URL so they can open it and add the item themselves.
5. For refunds, shipping, order status, FAQ, or contact—point them to the right page; we will provide those links in context when relevant.`;

  /** Build a strict allowlist text so the model only recommends real catalog products. */
  let productListText = "";
  const products = enriched?.products ?? (Array.isArray(enriched) ? enriched : parsedCatalog?.products) ?? [];
  if (Array.isArray(products) && products.length > 0) {
    const lines = products
      .filter((p) => p && (p.productUrl || p.url))
      .map((p) => `${p.title || p.name || "Product"}\n${p.productUrl || p.url}`);
    if (lines.length)
      productListText = `\n\nProducts you may recommend (use ONLY these; copy title and URL exactly):\n\n${lines.join("\n\n")}`;
  }

  // No products from MCP: don't call Groq—return safe canned reply so we never show invented products
  if (!productListText) {
    const canned =
      `I couldn't find specific products for that search. You can browse our catalog here: ${BASE_URL}/collections/all\n\nFor help with an order or other questions, contact us: ${PAGES.contact}`;
    if (debug) {
      debug.productTitles = [];
      debug.allowedUrlCount = 0;
      debug.rawReply = "(canned: no catalog results)";
      return { reply: canned, debug };
    }
    return canned;
  }

  const extraContextParts = [];
  if (productListText) {
    extraContextParts.push(productListText);
  }
  if (catalogContext) {
    extraContextParts.push(`Extra catalog detail (for description/tags only; still recommend only from the list above):\n${catalogContext}`);
  }
  if (policiesContext) {
    extraContextParts.push(`Policies/FAQ: ${policiesContext}`);
  }

  const systemInstruction =
    extraContextParts.length > 0
      ? `${baseInstruction}
${extraContextParts.join("\n\n")}`
      : baseInstruction;

  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set. Add it in Render (or .env) to use the chat.");
  }

  const messages = [
    { role: "system", content: systemInstruction },
    ...(Array.isArray(history) ? history : []).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.parts !== "undefined" ? (m.parts.find((p) => p.text)?.text ?? "") : (m.content ?? ""),
    })),
    { role: "user", content: message },
  ];

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  const rawReply = reply != null ? String(reply).trim() : "";
  const sanitized = sanitizeProductLinks(rawReply, allowedProductUrls);

  if (debug) {
    const products = enriched?.products ?? (Array.isArray(enriched) ? enriched : parsedCatalog?.products) ?? [];
    debug.productTitles = products.filter((p) => p && (p.title || p.name)).map((p) => p.title || p.name);
    debug.allowedUrlCount = allowedProductUrls.size;
    debug.rawReply = rawReply;
    return { reply: sanitized, debug };
  }
  return sanitized;
}