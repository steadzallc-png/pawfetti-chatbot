/**
 * Test the Storefront MCP directly (no Groq). Run from project root with .env set.
 *
 * Usage: node scripts/test-mcp.js [query]
 * Example: node scripts/test-mcp.js "dog grooming products"
 *
 * Curl equivalents (replace YOUR_MCP_DOMAIN with MCP_SHOP_DOMAIN, e.g. 4j7phc-vw.myshopify.com):
 *
 *   # MCP catalog search
 *   curl -s -X POST "https://YOUR_MCP_DOMAIN/api/mcp" \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_shop_catalog","arguments":{"query":"dog grooming products","context":"shopper"}}}'
 *
 *   # Full chat (backend calls MCP + Groq)
 *   curl -s -X POST "https://pawfetti-chatbot.onrender.com/api/chat" \
 *     -H "Content-Type: application/json" \
 *     -d '{"message":"show me some dog grooming products?"}'
 */
import "dotenv/config";

const SHOP_DOMAIN = process.env.MCP_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || "pawfetti-ai-sandbox.myshopify.com";
const MCP_ENDPOINT = `https://${SHOP_DOMAIN}/api/mcp`;

const query = process.argv[2] || "dog grooming products";

async function main() {
  console.log("MCP endpoint:", MCP_ENDPOINT);
  console.log("Query:", query);
  console.log("");

  const catalogPayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_shop_catalog",
      arguments: { query, context: "shopper" },
    },
  };

  console.log("--- Catalog search (search_shop_catalog) ---");
  try {
    const catalogRes = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalogPayload),
    });
    console.log("Status:", catalogRes.status, catalogRes.statusText);
    const catalogText = await catalogRes.text();
    let catalogData;
    try {
      catalogData = JSON.parse(catalogText);
    } catch {
      console.log("Response (raw):", catalogText.slice(0, 500));
      return;
    }
    if (catalogData.error) {
      console.log("Error:", catalogData.error);
      return;
    }
    console.log("Result (full JSON):");
    console.log(JSON.stringify(catalogData.result, null, 2));
  } catch (err) {
    console.error("Catalog request failed:", err.message);
  }

  console.log("");
  console.log("--- Policies/FAQ search (search_shop_policies_and_faqs) ---");
  const policiesPayload = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "search_shop_policies_and_faqs",
      arguments: { query, context: "shopper" },
    },
  };
  try {
    const policiesRes = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policiesPayload),
    });
    console.log("Status:", policiesRes.status, policiesRes.statusText);
    const policiesData = await policiesRes.json();
    if (policiesData.error) {
      console.log("Error:", policiesData.error);
      return;
    }
    console.log("Result (full JSON):");
    console.log(JSON.stringify(policiesData.result, null, 2));
  } catch (err) {
    console.error("Policies request failed:", err.message);
  }
}

main();
