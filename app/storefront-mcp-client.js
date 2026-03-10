import "dotenv/config";

const DEFAULT_SHOP_DOMAIN = "pawfetti-ai-sandbox.myshopify.com";
const SHOP_DOMAIN = process.env.MCP_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || DEFAULT_SHOP_DOMAIN;
const MCP_ENDPOINT = `https://${SHOP_DOMAIN}/api/mcp`;

async function callStorefrontTool(name, args) {
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: args,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Storefront MCP error ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.error) {
      console.error("Storefront MCP JSON-RPC error:", data.error);
      return null;
    }

    const result = data.result ?? null;
    return result;
  } catch (error) {
    console.error("Failed to call Storefront MCP tool:", error);
    return null;
  }
}

export async function searchCatalog(query) {
  if (!query || typeof query !== "string") return null;
  return callStorefrontTool("search_shop_catalog", {
    query,
    context: "shopper",
  });
}

export async function searchPolicies(query) {
  if (!query || typeof query !== "string") return null;
  return callStorefrontTool("search_shop_policies_and_faqs", {
    query,
    context: "shopper",
  });
}

