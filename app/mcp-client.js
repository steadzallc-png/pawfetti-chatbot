import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { searchCatalog, searchPolicies } from "./storefront-mcp-client.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function processChatMessage(message, history) {
  const contents = [
    ...(Array.isArray(history) ? history : []),
    { role: "user", parts: [{ text: message }] },
  ];

  let catalogContext = "";
  let policiesContext = "";

  try {
    const [catalogResult, policiesResult] = await Promise.all([
      searchCatalog(message),
      searchPolicies(message),
    ]);

    if (catalogResult) {
      const serialized = JSON.stringify(catalogResult);
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
Be warm, professional, and do not use emojis.`;

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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction,
    },
  });

  return typeof response.text === "function" ? response.text() : response.text;
}