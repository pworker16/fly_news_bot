// newsClassifierGemini.js
// npm i @google/generative-ai
// export GOOGLE_API_KEY_CLASSIFIER=...
// export GOOGLE_CLASSIFIER_MODEL=gemini-1.5-flash (or your chosen model)

import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY_CLASSIFIER);
const model = genAI.getGenerativeModel({
  model: process.env.GOOGLE_CLASSIFIER_MODEL,
});

const CATEGORIES = [
  "Position Change",
  "Notable Stock Movements",
  "Mergers & Acquisitions",
  "Partnerships & Collaborations",
  "Product Launches & Innovations",
  "Contract Awards",
  "Share Repurchase Programs",
  "Buyback",
  "Trump",
  "Secondary Offering",
  "Primary Offering",
  "Exchange Listings & Transfers",
  "Index Changes & Rebalances",
  "Ownership & Fund Transactions",
  "Stock Split",
  "Internal Trade",
  "Other",
];

const FEW_SHOTS = [
  // Position Change
  { title: "Perpetua Resources says Mark Murchison to succeed Jessica Largent as CFO", label: "Position Change" },
  { title: "Genius Sports CFO Nick Taylor to depart, Bryan Castellani to succeed", label: "Position Change" },
  { title: "NN, Inc. promotes Gregg Cottage to chief information officer", label: "Position Change" },
  { title: "Fresenius Medical appoints Joseph Turk as CEO, Care Enablement", label: "Position Change" },

  // Notable Stock Movements
  { title: "GoodRx jumps 21% to $5.14 in late trading", label: "Notable Stock Movements" },
  { title: "AST SpaceMobile rises 12.8%", label: "Notable Stock Movements" },
  { title: "Reddit down 11% in pre-market at $204.15 amid high StockTwits volume", label: "Notable Stock Movements" },

  // M&A
  { title: "FPAY Synchrony acquires Versatile Credit, terms not disclosed", label: "Mergers & Acquisitions" },
  { title: "Axcelis, Veeco to combine in an all-stock merger with enterprise value of $4.4B", label: "Mergers & Acquisitions" },

  // Partnerships
  { title: "IBM and AMD announce collaboration to deliver AI infrastructure to Zyphra", label: "Partnerships & Collaborations" },
  { title: "T-Mobile announces expansion of T-Satellite with Starlink", label: "Partnerships & Collaborations" },

  // Product Launches
  { title: "Google unveils AI-powered Gemini for Home", label: "Product Launches & Innovations" },
  { title: "Peloton launches Peloton Pro Series", label: "Product Launches & Innovations" },
  { title: "Apple designing smart glasses with and without displays, Bloomberg says", label: "Product Launches & Innovations" },

  // Contract Awards
  { title: "AeroVironment selected for 10-year, $499M Air Force contract", label: "Contract Awards" },
  { title: "V2X awarded $84M contract by U.S. Navy", label: "Contract Awards" },
  { title: "Ondas places initial order for 500 Wasp drones from Rift Dynamics", label: "Contract Awards" },

  // Share Repurchase Programs
  { title: "Globant authorizes new $125M share repurchase program", label: "Share Repurchase Programs" },
  { title: "Scotiabank plans to repurchase up to 20M common shares", label: "Share Repurchase Programs" },

  // Buyback
  { title: "Ovintiv renews annual buyback program", label: "Buyback" },
  { title: "The Bancorp increases buyback program by $500M", label: "Buyback" },

  // Trump
  { title: "Trump unveils 35% tariffs on Canada", label: "Trump" },
  { title: "President Trump says TikTok deal has China's approval", label: "Trump" },

  // Secondary Offering
  { title: "Waystar files to sell 75.66M shares of common stock for holders", label: "Secondary Offering" },
  { title: "Somnigroup launches secondary offering of 15.4M shares", label: "Secondary Offering" },

  // Primary Offering
  { title: "Rapport Therapeutics announces $250M common stock offering", label: "Primary Offering" },
  { title: "Actuate prices 2.14M shares at $7.00 in underwritten public offering", label: "Primary Offering" },

  // Exchange Listings & Transfers
  { title: "CompoSecure transfers listing to NYSE from Nasdaq", label: "Exchange Listings & Transfers" },
  { title: "Cumulus Media to delist from Nasdaq, transfer listing to OTC Markets' OTCQB tier", label: "Exchange Listings & Transfers" },

  // Index Changes & Rebalances
  { title: "Bentley Systems to replace Western Union in S&P 400 at open on 10/6", label: "Index Changes & Rebalances" },
  { title: "Western Union to replace Mr. Cooper in S&P 600 at open on 10/6", label: "Index Changes & Rebalances" },

  // Ownership & Fund Transactions
  { title: "Soros Fund Management takes 5.7% passive stake in Kodiak AI", label: "Ownership & Fund Transactions" },
  { title: "Cathie Wood's ARK Investment buys 30.1K shares of Alibaba today", label: "Ownership & Fund Transactions" },

  // Stock Split
  { title: "Outset Medical announces 1-for-15 reverse stock split", label: "Stock Split" },
  { title: "Cellectar Biosciences announces 1-for-30 reverse stock split", label: "Stock Split" },

  // internal trade
  { title: "Snowflake's Raghunathan sells $2.63M of common shares", label: "Internal Trade" },
  { title: "Roku's Ozgen sells $5.05M of common shares", label: "Internal Trade" },
];

// ---------- Single-title (kept for convenience) ----------
function buildPrompt(title) {
  const shots = FEW_SHOTS.map(
    (ex) => `Title: "${ex.title}"\nCategory: ${ex.label}`
  ).join("\n\n");

  return `
You are a strict classifier for financial news headlines.
Return ONLY a single-line JSON object with this exact schema:
{"category":"<one of: ${CATEGORIES.join(" | ")}>"}

Rules:
- Output JSON ONLY. No prose, no code fences, no extra keys.
- Choose exactly one category from the allowed set. If none fit, use "Other".
- Be concise and deterministic.

Few-shot examples:
${shots}

Now classify the following headline:

Title: "${title}"

Return JSON only:
`.trim();
}

export async function classifyTitle(title) {
  const prompt = buildPrompt(title);
  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 50 },
  });
  const text = res.response.text().trim();

  let category = "Other";
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj.category === "string") category = obj.category;
  } catch {
    const m = text.match(/"category"\s*:\s*"([^"]+)"/i);
    if (m) category = m[1];
  }
  if (!CATEGORIES.includes(category)) category = "Other";
  return category;
}

// ---------- One-call batch version ----------
function buildBatchPrompt(titles) {
  const shots = FEW_SHOTS.map(
    (ex) => `Title: "${ex.title}"\nCategory: ${ex.label}`
  ).join("\n\n");

  const indexed = titles
    .map((t, i) => `${i}) "${t.replace(/"/g, '\\"')}"`)
    .join("\n");

  return `
You are a strict classifier for financial news headlines.

Allowed categories (choose EXACTLY one): ${CATEGORIES.join(" | ")}

Category definitions (use these rules):
- Exchange Listings & Transfers: moves between listing venues (Nasdaq ↔ NYSE), delistings, OTC migrations. Not index membership.
- Index Changes & Rebalances: additions/removals/replacements to S&P/FTSE/MSCI/Russell indices or scheduled rebalances.
- Ownership & Fund Transactions: fund/insider filings or trades (13D/13G, passive stake %, fund buys/sells shares).
- Notable Stock Movements: price/percent moves or gaps without being primarily about index/ownership/offerings.
- Other categories keep their intuitive meanings (M&A, Partnerships, Offerings, Buyback, etc.).

Precedence / tie-breakers:
- If headline mentions S&P/FTSE/MSCI/Russell membership ("replace", "added", "removed", "at the open"), choose "Index Changes & Rebalances" (not "Exchange Listings & Transfers").
- If headline mentions passive stake %, 13D/13G, or "[Fund] buys/sells X shares", choose "Ownership & Fund Transactions" (not "Notable Stock Movements").
- If none fit, choose "Other".

Rules:
- Output JSON ONLY matching the provided schema (no prose).
- If none fit, use "Other".
- Be deterministic.

Few-shot examples:
${shots}

Now classify each headline by index.

Headlines:
${indexed}

Return JSON matching this schema:
{"results":[{"i":<index>,"category":"<one of: ${CATEGORIES.join(" | ")}>"}]}
`.trim();
}

export async function classifyBatchOneCall(titles) {
  const prompt = buildBatchPrompt(titles);
  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          results: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                i: { type: "INTEGER" },
                category: { type: "STRING", enum: CATEGORIES },
              },
              required: ["i", "category"],
            },
          },
        },
        required: ["results"],
      },
    },
  });

  let data;
  try {
    data = JSON.parse(res.response.text());
  } catch {
    const m = res.response.text().match(/\{[\s\S]*\}/);
    data = m ? JSON.parse(m[0]) : { results: [] };
  }

  const out = new Array(titles.length).fill(null).map((_, i) => ({
    title: titles[i],
    category: "Other",
  }));

  for (const r of data.results || []) {
    if (
      Number.isInteger(r.i) &&
      r.i >= 0 &&
      r.i < titles.length &&
      typeof r.category === "string" &&
      CATEGORIES.includes(r.category)
    ) {
      out[r.i].category = postCorrectCategory(r.category, titles[r.i]);
    }
  }
  return out;
}

// Post-correction heuristic for high-precision edge cases
function postCorrectCategory(category, title) {
  // Prefer rules if pattern is strong
  if (/(s&p|ftse|msci|russell)\s?(?:\d{3,4})?.*\b(replace|added|removed|to join|to be added|to be removed|at (the )?open)\b/i.test(title)) {
    return "Index Changes & Rebalances";
  }
  if (/\b(13d|13g|passive stake|takes \d+(\.\d+)?% stake|acquires stake|increases stake|reduces stake|[0-9.,]+\s*(k|m|b)\s*shares|ark investment buys|ark (bought|buys|sells))\b/i.test(title)) {
    return "Ownership & Fund Transactions";
  }
  return category;
}

// ---------- Public batch wrapper with dedup ----------
export async function classifyBatch(titles) {
  // De-duplicate to save tokens
  const map = new Map(); // title -> indices
  titles.forEach((t, i) => {
    const k = t.trim();
    map.set(k, (map.get(k) || []).concat(i));
  });

  const unique = Array.from(map.keys());
  const uniqueResults = await classifyBatchOneCall(unique);

  // Fan-out back to original indices (avoid shared refs)
  const results = new Array(titles.length);
  uniqueResults.forEach((r, ui) => {
    const idxs = map.get(r.title) || [];
    for (const i of idxs) results[i] = { title: titles[i], category: r.category };
  });

  console.log("Classification results:", results);
  return results;
}

// ---------- Optional local test ----------
function test() {
  (async () => {
    const tests = [
      "Perpetua Resources says Mark Murchison to succeed Jessica Largent as CFO",
      "GoodRx jumps 21% to $5.14 in late trading",
      "CompoSecure transfers listing to NYSE from Nasdaq",
      "Bentley Systems to replace Western Union in S&P 400 at open on 10/6",
      "Soros Fund Management takes 5.7% passive stake in Kodiak AI",
      "Cathie Wood's ARK Investment buys 30.1K shares of Alibaba today",
      "Amazon launches Amazon Grocery",
      "Random headline with no finance context",
      "Apple designing smart glasses with and without displays, Bloomberg says",
      "Apple designing smart glasses with and without displays, Bloomberg says"
    ];
    console.log(await classifyBatch(tests));
  })();
}
// test();
