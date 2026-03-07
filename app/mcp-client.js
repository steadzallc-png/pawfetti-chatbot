import "dotenv/config";
import { searchCatalog, searchPolicies } from "./storefront-mcp-client.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

const BASE_URL = "https://pawfetti.steadza.com";
const PAGES = {
  contact: `${BASE_URL}/pages/contact-us`,
  faq: `${BASE_URL}/pages/faq`,
  shipping: `${BASE_URL}/pages/shipping-handling`,
  refund: `${BASE_URL}/policies/refund-policy`,
};

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
 */
function sanitizeProductLinks(reply, allowedProductUrls) {
  if (!reply) return reply;
  const base = BASE_URL.replace(/\/$/, "");
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const productUrlRegex = new RegExp(`${escapedBase}/products/[^\\s)\\]]+`, "gi");
  return reply
    .replace(productUrlRegex, (match) => {
      if (allowedProductUrls.size === 0) return " ";
      const norm = match.trim().toLowerCase().replace(/\/$/, "").replace(/[.,;:)\]}\s]+$/, "");
      return allowedProductUrls.has(norm) ? match : " ";
    })
    .replace(/\n{3,}/g, "\n\n")
    .replace(/  +/g, " ")
    .trim();
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

export async function processChatMessage(message, history) {
  const policyReply = getPolicyResponse(message);
  if (policyReply) return policyReply;

  let catalogContext = "";
  let policiesContext = "";
  let allowedProductUrls = new Set();

  try {
    const [catalogResult, policiesResult] = await Promise.all([
      searchCatalog(message),
      searchPolicies(message),
    ]);

    if (catalogResult) {
      const parsedCatalog = parseMcpContent(catalogResult);
      if (parsedCatalog) {
        const enriched = enrichCatalogWithProductUrls(parsedCatalog);
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

  const baseInstruction = `You are a helpful pet shop assistant. The name of the shop is Pawfetti.
Our products are strictly classified into: Dog, Cat, Small Pets, and Pet Parents.
- If a customer asks for small animals, look for 'Small Pets' tags.
- If they want clothing or car items for themselves, look for 'Pet Parents'.
Use the Storefront MCP data provided to ground your answers in real products, policies, and store information.
Be warm, professional, and do not use emojis.
You cannot add items to the cart for the customer. If they ask to add something to cart, give them the product page URL (from catalog data or base ${BASE_URL}) so they can open it and add the item themselves. Do not promise to "add it" or "check inventory" on their behalf.
When recommending a product, you may ONLY use a productUrl that appears in the catalog results below. Do not create, guess, or invent any product URL or handle. Only mention products that are in the catalog—use the exact title and url from the JSON. Never make up product names (e.g. no "Pawfetti Oatmeal Dog Shampoo", "FURminator", "Oster" unless they appear in the catalog). If the customer asks for something not in the catalog results, say we don't have that exact product and suggest they browse the store or contact us—never give a product link for something not in the catalog.`;

  const extraContextParts = [];
  if (catalogContext) {
    extraContextParts.push(`Catalog search results (JSON): ${catalogContext}`);
  }
  if (policiesContext) {
    extraContextParts.push(`Policy and FAQ search results (JSON): ${policiesContext}`);
  }

  const systemInstruction =
    extraContextParts.length > 0
      ? `${baseInstruction}

When answering, you may rely on the following live Storefront MCP data. If it's relevant to the question, prefer it over guesses.

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
  return sanitizeProductLinks(rawReply, allowedProductUrls);
}