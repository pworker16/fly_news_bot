import "dotenv/config";
import { log, warn, error } from "./utils/logger.js";
import { fetchLatestHeadlines } from "./scrapeTheFly.js";
import { normalizeCategory } from "./categorize.js";
import {
  ensureDir,
  logPathForCategory,
  hasLine,
  appendLine,
} from "./logStore.js";
import { findRecentArticle } from "./searchNews.js";
import { summarizeWithGemini } from "./summarize.js";
import { postToDiscord } from "./notifyDiscord.js";
import { fetchAndExtract } from "./fetchArticle.js";
import { passesListingAndCap } from "./listingAndCapFilter.js";
import { classifyBatch } from "./geminiClassifier.js";
import { DateTime } from "luxon";

function convertToIsraelTime(publishDatetime) {
  return DateTime.fromFormat(publishDatetime, "yyyy-MM-dd HH:mm:ss", {
    zone: "America/New_York",
  })
    .setZone("Asia/Jerusalem")
    .toFormat("dd.MM.yyyy HH:mm");
}

// Function to check if title contains all words from any exclusion phrase
function containsExclusionPhrase(title, exclusionPhrases) {
  return exclusionPhrases.some((phrase) => {
    const words = phrase.toLowerCase().split(" ");
    return words.every((word) => title.toLowerCase().includes(word));
  });
}

async function main() {
  try {
    const THEFLY_URL = process.env.THEFLY_URL || "https://thefly.com/news.php";
    const MAX_HEADLINES = Number(process.env.MAX_HEADLINES || 10);
    const SEARCH_WINDOW_MIN = Number(process.env.SEARCH_WINDOW_MIN || 60);
    const LOG_DIR = process.env.LOG_DIR || "./data/logs";
    const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0";
    const HEADLESS = String(process.env.HEADLESS || "true") === "true";
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");

    // Parse the webhooks from the .env file
    let WEBHOOKS = {};
    try {
      WEBHOOKS = JSON.parse(process.env.DISCORD_WEBHOOKS_JSON || "{}");
    } catch {
      // No-op
    }

    // Get the keys of the WEBHOOKS object (e.g., ['All1', 'All2'])
    const webhookKeys = Object.keys(WEBHOOKS);
    let webhookIndex = 0;

    ensureDir(LOG_DIR);

    const newsRows = await fetchLatestHeadlines({
      url: THEFLY_URL,
      limit: MAX_HEADLINES,
      userAgent: USER_AGENT,
      headless: HEADLESS,
    });

    // Categories to exclude from discord
    const EXCLUDED_CATEGORIES = [
      "Syndicate",
      "Options",
      "Tech Analysis",
      "Earnings",
      "Events",
      "Recommendations",
    ];

    // Phrases to exclude from headlines
    const EXCLUSION_PHRASES = [
      "trading halted",
      "trading resumes",
      "mixed securities shelf",
      "sell common stock",
      "dividend to from",
      "dividend per share",
      "What You Missed",
      "Buy/Sell:",
	  "Opening Day:",
      "Morning Movers:",
      "Market Update:",
      "Energy Action:",
	  "Treasury Market Summary:",
      "Closing Bell Movers:",
	  "Crypto Currents:",
	  "AI Daily:",
    ];

    const EXCLUDED_CLASSES = [
      "Position Change",
      "Notable Stock Movements",
      "Mergers & Acquisitions",
      "Share Repurchase Programs",
      "Buyback",
      "Secondary Offering",
      "Primary Offering",
      "Exchange Listings & Transfers",
      "Stock Split",
	  "Internal Trade",
    ];

    // row structure is:
    // {
    //   title: "Cellectar Biosciences announces 1-for-30 reverse stock split",
    //   titleLink: "https://thefly.com/landingPageNews.php?id=2889701",
    //   rawCategory: "Stock Split",
    //   rawCategoryClass: "icon_stock_split",
    //   rawCategoryLabel: "Stock Split",
    //	 rawTopic: "stock-split",
    //   tickers: "CLRB",
    //   publishDatetime: "2024-10-08 16:00:00"
    // }
    let filteredRows = [];
    // from rows remove any row that its rawCategory found in the EXCLUDED_CATEGORIES list
    for (const currentRow of newsRows) {
		const category = normalizeCategory(currentRow.rawCategory);
      if (
        EXCLUDED_CATEGORIES.includes(category)
      ) {
        log("[X] Excluded due to: Category filter - ", currentRow.title);
        continue;
      }

      // filter out messages that contains phrases to exclude
      if (containsExclusionPhrase(currentRow.title, EXCLUSION_PHRASES)) {
        log("[X] Excluded due to: Phrase filter - ", currentRow.title);
        continue;
      }

      const logPath = logPathForCategory(LOG_DIR, category);

      // filter out messages that has already been processed for this category
      if (hasLine(logPath, currentRow.title)) {
        log("[X] Excluded due to: Log filter - ", currentRow.title);
        continue;
      }

      filteredRows.push(currentRow);
    }

    // create a list of titles from the filtered rows
    const filteredTitles = filteredRows.map((r) => r.title);

    // send remaining rows to gemini for categorization
    const classifiedRows = await classifyBatch(filteredTitles);

    // remove from classifiedRows all the rows that their category is found in the EXCLUDED_CLASSES list
    let rows = [];
    for (const classifiedRow of classifiedRows) {
      if (!EXCLUDED_CLASSES.includes(classifiedRow.category)) {
        // find the original row to get the other fields
        const originalRow = filteredRows.find(
          (r) => r.title === classifiedRow.title
        );
        if (originalRow) {
          rows.push(originalRow);
        } else {
          log(
            "[X] Excluded due to: Original row not found - ",
            classifiedRow.title
          );
        }
      } else {
        log("[X] Excluded due to: Class filter - ", classifiedRow.title);
      }
    }

    // loop through the rows and process them
    for (const row of rows) {
      const { title, titleLink, rawCategory, tickers, publishDatetime } = row;
      const category = normalizeCategory(rawCategory);
      let israelTime = convertToIsraelTime(publishDatetime);
      if (!israelTime) israelTime = `${publishDatetime} [US/NY]`;
      log(
        "Headline:",
        title,
        "| RawCat:",
        rawCategory,
        "=>",
        category,
        ", israelTime: ",
        israelTime
      );

      // --- Normalize tickers to array ---
      const tickersArr = Array.isArray(tickers)
        ? tickers
        : typeof tickers === "string"
        ? tickers.split(/[,\s]+/).filter(Boolean)
        : [];

      // filter out messages with tickers that are not in NASDAQ/NYSE and market cap are less then 1B$
      let validTickers = [];
      try {
        const checks = await Promise.all(
          tickersArr.map((t) => passesListingAndCap(t, { requireEquity: true }))
        );
        validTickers = tickersArr.filter((t, i) => checks[i]?.ok);
        if (!validTickers.length) {
          log("[X] Excluded due to: Market Cap or Exchange - ", title);
          continue;
        }
      } catch (e) {
        warn("Market Cap or Exchange check failed due to:", e.message);
        log(
          "[X] Excluded due to: Market Cap or Exchange check failed - ",
          title
        );
        continue;
      }

      // Search news (last X minutes)
      const article = await findRecentArticle({
        query: title,
        windowMin: SEARCH_WINDOW_MIN,
      });
      let articleText = title;
      let finalUrl = titleLink;

      if (article) {
        log(
          "Found article:",
          article.title,
          article.link,
          article.pubDate?.toISOString()
        );

        // Fetch raw HTML and extract readable text
        try {
          const extracted = await fetchAndExtract({
            url: article.link,
            userAgent: USER_AGENT,
          });
          articleText = extracted.text;
          finalUrl = extracted.link;
        } catch (e) {
          warn("Article fetch/extract failed due to:", e.message);
          articleText = title;
          finalUrl = titleLink;
        }
      }

      // Summarize with Gemini using local content
      let summary;
      const logPath = logPathForCategory(LOG_DIR, category);
      try {
        summary = await summarizeWithGemini({
          apiKey: GOOGLE_API_KEY,
          flyText: title,
          articleText: articleText,
        });
      } catch (e) {
        warn("Gemini summarize failed:", e.message);
        log("[X] Excluded due to: Failed to summarize - ", title);
        appendLine(logPath, title);
        continue;
      }

      // Cycle through webhook keys
      let webhookKey = webhookKeys[webhookIndex];
      if (webhookIndex === webhookKeys.length - 1) {
        webhookIndex = 0;
      } else {
        webhookIndex++;
      }
      const webhookUrl = WEBHOOKS[webhookKey];

      // Send to Discord
      try {
        await postToDiscord({
          webhookUrl: webhookUrl,
          category: category,
          headline: title,
          articleUrl: finalUrl ? finalUrl : "",
          summary: summary,
          tickers: validTickers.join(","),
          publishDatetime: israelTime,
        });
      } catch (e) {
        warn("Discord post failed:", e.message);
        log("[X] Excluded due to: Post to Discord failed - ", title);
        appendLine(logPath, title);
        continue;
      }

      // Finally mark as processed
      log("[V] Successfuly sent to discord - ", title);
      appendLine(logPath, title);
    }

    log("Done.");
  } catch (e) {
    error("Fatal error:", e);
    process.exitCode = 1;
  }
}

main();
