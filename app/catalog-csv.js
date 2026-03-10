/**
 * Load product catalog from Shopify export CSV and search by title + description.
 * Used when USE_GROQ_MCP is off. CSV path: CATALOG_CSV_PATH or files/products_export_1.csv.
 */

import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_CSV_PATH = join(process.cwd(), "files", "products_export_1.csv");

/**
 * Parse one CSV line respecting double-quoted fields (handles commas inside quotes).
 */
function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const parts = [];
      while (end < line.length) {
        if (line[end] === '"') {
          if (line[end + 1] === '"') {
            parts.push('"');
            end += 2;
          } else {
            end++;
            break;
          }
        } else {
          parts.push(line[end]);
          end++;
        }
      }
      out.push(parts.join(""));
      i = end;
      if (line[i] === ",") i++;
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) end = line.length;
      out.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return out;
}

/** Strip HTML tags for plain-text search. */
function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Load CSV and return unique products by Handle with Title, Body (description), minPrice.
 */
function loadCatalog(csvPath = process.env.CATALOG_CSV_PATH || DEFAULT_CSV_PATH) {
  let raw;
  try {
    raw = readFileSync(csvPath, "utf-8");
  } catch (e) {
    console.error("[catalog-csv] Failed to read CSV:", csvPath, e.message);
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const handleIdx = header.indexOf("Handle");
  const titleIdx = header.indexOf("Title");
  const bodyIdx = header.indexOf("Body (HTML)");
  const variantPriceIdx = header.indexOf("Variant Price");
  if (handleIdx === -1) {
    console.error("[catalog-csv] No Handle column in CSV");
    return [];
  }

  const byHandle = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const handle = row[handleIdx]?.trim();
    if (!handle) continue;
    if (/[\s:]/.test(handle) || handle.length < 2) continue;
    const title = titleIdx >= 0 ? row[titleIdx]?.trim() : "";
    const body = bodyIdx >= 0 ? row[bodyIdx]?.trim() : "";
    const priceRaw = variantPriceIdx >= 0 ? row[variantPriceIdx]?.trim() : "";
    const price = parseFloat(priceRaw);

    if (!byHandle.has(handle)) {
      byHandle.set(handle, {
        handle,
        title: title || "Product",
        description: stripHtml(body),
        minPrice: Number.isFinite(price) ? price : undefined,
      });
    } else {
      const existing = byHandle.get(handle);
      if (title && (!existing.title || existing.title === "Product")) existing.title = title;
      if (existing.description === "" && body) existing.description = stripHtml(body);
      if (Number.isFinite(price)) {
        if (existing.minPrice == null || price < existing.minPrice) existing.minPrice = price;
      }
    }
  }
  return Array.from(byHandle.values()).filter((p) => p.title && p.title !== "Product");
}

let cachedProducts = null;

function getProducts() {
  if (cachedProducts === null) {
    cachedProducts = loadCatalog();
    console.log("[catalog-csv] Loaded", cachedProducts.length, "products");
  }
  return cachedProducts;
}

/**
 * Search catalog by query. Matches against title and description (case-insensitive).
 * Returns up to maxResults with title, handle, url, price (formatted as $X.XX).
 */
export function searchCatalogCsv(query, baseUrl = "https://pawfetti.steadza.com", maxResults = 5) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  const base = baseUrl.replace(/\/$/, "");
  const products = getProducts();
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = products.map((p) => {
    const title = (p.title || "").toLowerCase();
    const description = (p.description || "").toLowerCase();
    const searchable = `${title} ${description}`;
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      else if (description.includes(t)) score += 2;
      else if (searchable.includes(t)) score += 1;
    }
    return { ...p, score };
  });
  return scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((p) => ({
      title: p.title,
      handle: p.handle,
      url: `${base}/products/${p.handle}`,
      price: p.minPrice != null ? `$${Number(p.minPrice).toFixed(2)}` : null,
    }));
}
