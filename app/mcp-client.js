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

  try {
    const [catalogResult, policiesResult] = await Promise.all([
      searchCatalog(message),
      searchPolicies(message),
    ]);

    if (catalogResult) {
      const enriched = enrichCatalogWithProductUrls(catalogResult);
      const serialized = JSON.stringify(enriched);
      catalogContext = serialized.slice(0, 1500);
    }

    if (policiesResult) {
      const serialized = JSON.stringify(policiesResult);
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
When you recommend or mention a product from the catalog, you MUST include its full product page URL in your reply so the customer gets a clickable link. Use the productUrl field from the catalog, or if you only have a handle use: ${BASE_URL}/products/HANDLE. Put the URL on its own line.`;

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
  return reply != null ? String(reply).trim() : "";
}