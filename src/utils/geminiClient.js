import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const clientCache = new Map();
let activeApiKey = null;

export function parseGoogleApiKeys(rawValue) {
  if (!rawValue) return [];
  let cleaned = String(rawValue).trim();
  if (!cleaned) return [];
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

export function getGoogleApiKeys() {
  return parseGoogleApiKeys(process.env.GOOGLE_API_KEYS);
}

export function setActiveGeminiKey(apiKey) {
  activeApiKey = apiKey || null;
}

export function getActiveGeminiKey() {
  return activeApiKey;
}

export function getGeminiClient(apiKey = activeApiKey) {
  if (!apiKey) {
    throw new Error("Missing Google Gemini API key");
  }
  if (!clientCache.has(apiKey)) {
    clientCache.set(apiKey, new GoogleGenerativeAI(apiKey));
  }
  return clientCache.get(apiKey);
}

export function getGeminiModel({ model, apiKey } = {}) {
  const client = getGeminiClient(apiKey ?? activeApiKey);
  return client.getGenerativeModel({ model });
}
