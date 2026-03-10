/**
 * Test the full chat pipeline locally (MCP + Groq) before deploying.
 * Requires .env with GROQ_API_KEY and MCP_SHOP_DOMAIN (or SHOPIFY_SHOP_DOMAIN).
 *
 * Usage: node scripts/test-chat-local.js "your message here"
 * Example: node scripts/test-chat-local.js "what cat products do you have for grooming?"
 */

import "dotenv/config";
import { processChatMessage } from "../app/mcp-client.js";

const message = process.argv[2];
if (!message) {
  console.error("Usage: node scripts/test-chat-local.js \"your message\"");
  process.exit(1);
}

if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY is not set in .env");
  process.exit(1);
}

async function main() {
  console.log("Message:", message);
  console.log("");

  const result = await processChatMessage(message, [], { debug: true });

  console.log("--- ALLOWED PRODUCTS (from MCP catalog) ---");
  if (result.debug.productTitles.length) {
    result.debug.productTitles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  } else {
    console.log("  (none)");
  }
  console.log("Allowed URL count:", result.debug.allowedUrlCount);
  console.log("");

  console.log("--- RAW REPLY (from Groq, before sanitize) ---");
  console.log(result.debug.rawReply || "(empty)");
  console.log("");

  console.log("--- FINAL REPLY (after sanitize, what user sees) ---");
  console.log(result.reply || "(empty)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
