/**
 * Run catalog search tests (CSV mode). Ensure USE_GROQ_MCP is not set so we use files/products_export_1.csv.
 *
 * Usage: node scripts/test-catalog-queries.js
 */

import "dotenv/config";
import { processChatMessage } from "../app/mcp-client.js";

const QUERIES = [
  "cat grooming",
  "hair brush",
  "pet parent tshirt",
  "bird cage",
  "hamster wheels",
  "lizard cage",
];

async function main() {
  // Force CSV mode for these tests
  const prev = process.env.USE_GROQ_MCP;
  process.env.USE_GROQ_MCP = "0";

  console.log("Catalog query tests (CSV mode)\n");

  for (const query of QUERIES) {
    console.log("--- Query:", query);
    const result = await processChatMessage(query, [], { debug: true });
    const reply = typeof result === "string" ? result : result.reply;
    const debug = typeof result === "object" ? result.debug : null;

    if (debug?.productTitles?.length) {
      console.log("  Products found:", debug.productTitles.length);
      debug.productTitles.forEach((t, i) => console.log("   ", i + 1 + ".", t));
    } else {
      console.log("  Products found: 0 (contact-us reply)");
    }

    // Show first 3 lines of reply + "..." if longer
    const replyLines = reply.split("\n").filter(Boolean);
    const preview = replyLines.slice(0, 5).join("\n");
    console.log("  Reply preview:\n" + preview.split("\n").map((l) => "     " + l).join("\n"));
    if (replyLines.length > 5) console.log("     ...");
    console.log("");
  }

  if (prev !== undefined) process.env.USE_GROQ_MCP = prev;
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
