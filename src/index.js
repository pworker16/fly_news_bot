import 'dotenv/config';
import { log, warn, error } from './utils/logger.js';
import { fetchLatestHeadlines } from './scrapeTheFly.js';
import { normalizeCategory } from './categorize.js';
import { ensureDir, logPathForCategory, hasLine, appendLine } from './logStore.js';
import { findRecentArticle } from './searchNews.js';
import { summarizeWithGemini } from './summarize.js';
import { postToDiscord } from './notifyDiscord.js';
import { fetchAndExtract } from './fetchArticle.js';
import { passesListingAndCap } from './listingAndCapFilter.js';
import { DateTime } from 'luxon';


function convertToIsraelTime(publishDatetime) {
  return DateTime.fromFormat(publishDatetime, "yyyy-MM-dd HH:mm:ss", { zone: "America/New_York" })
    .setZone("Asia/Jerusalem")
    .toFormat("dd.MM.yyyy HH:mm");
}

// Function to check if title contains all words from any exclusion phrase
function containsExclusionPhrase(title, exclusionPhrases) {
  return exclusionPhrases.some(phrase => {
    const words = phrase.toLowerCase().split(' ');
    return words.every(word => title.toLowerCase().includes(word));
  });
}

async function main() {
  try {
    const THEFLY_URL = process.env.THEFLY_URL || 'https://thefly.com/news.php';
    const MAX_HEADLINES = Number(process.env.MAX_HEADLINES || 10);
    const SEARCH_WINDOW_MIN = Number(process.env.SEARCH_WINDOW_MIN || 60);
    const LOG_DIR = process.env.LOG_DIR || './data/logs';
    const USER_AGENT = process.env.USER_AGENT || 'Mozilla/5.0';
    const HEADLESS = String(process.env.HEADLESS || 'true') === 'true';
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_API_KEY');

	// Parse the webhooks from the .env file
	let WEBHOOKS = {};
	try {
	  WEBHOOKS = JSON.parse(process.env.DISCORD_WEBHOOKS_JSON || '{}');
	} catch {
	  // No-op
	}

	// Get the keys of the WEBHOOKS object (e.g., ['All1', 'All2'])
	const webhookKeys = Object.keys(WEBHOOKS);

    ensureDir(LOG_DIR);

    const rows = await fetchLatestHeadlines({ url: THEFLY_URL, limit: MAX_HEADLINES, userAgent: USER_AGENT, headless: HEADLESS });
	
	// Categories to exclude from discord
	const EXCLUDED_CATEGORIES = ['Syndicate', 'Options', 'Tech Analysis', 'Earnings', 'Events', 'Recommendations'];
	
	// Phrases to exclude from headlines
    const EXCLUSION_PHRASES = [
      'trading halted',
	  'trading resumes',
      'mixed securities shelf',
      'sell common stock',
	  'dividend to from',
	  'dividend per share',
	  'What You Missed',
	  'Buy/Sell:',
	  'Morning Movers:',
	  'Closing Bell Movers:',
    ];
	
    let useFirstWebhook = true;
    for (const row of rows) {
      const { title, titleLink, rawCategory, tickers, publishDatetime } = row;
      const category = normalizeCategory(rawCategory);
	  let israelTime = convertToIsraelTime(publishDatetime);
      log('Headline:', title, '| RawCat:', rawCategory, '=>', category);



      // --- Normalize tickers to array ---
      const tickersArr = Array.isArray(tickers)
        ? tickers
        : (typeof tickers === 'string'
            ? tickers.split(/[,\s]+/).filter(Boolean)
            : []);

      // filter out messages with tickers that are not in NASDAQ/NYSE and market cap are less then 1B$
      let validTickers = [];
      try {
        const checks = await Promise.all(
          tickersArr.map(t => passesListingAndCap(t, { requireEquity: true }))
        );
        validTickers = tickersArr.filter((t, i) => checks[i]?.ok);
        if (!validTickers.length) {
          log('Filtered out by listing/cap', { headline: title, tickers: tickersArr, checks });
          continue;
        }
      } catch (e) {
        warn('listing/cap filter failed, skipping headline', { err: e?.message });
        continue;
      }
	  // Skip if title contains any exclusion phrase
      if (containsExclusionPhrase(title, EXCLUSION_PHRASES)) {
        log('Excluded due to phrase match:', title);
        continue;
      }
	  
      // if this is one of the categories we want to send - then process it
	  if (!EXCLUDED_CATEGORIES.includes(category)) {
		  const logPath = logPathForCategory(LOG_DIR, category);

		  // If title already processed for this category, skip
		  if (hasLine(logPath, title)) {
			log('Already in log, skipping:', title);
			continue;
		  }

		  // Search news (last X minutes)
		  const article = await findRecentArticle({ query: title, windowMin: SEARCH_WINDOW_MIN });
		  let articleText = title;
		  let finalUrl = titleLink;
		  
		  if (article) {
			  log('Found article:', article.title, article.link, article.pubDate?.toISOString());

			  // Fetch raw HTML and extract readable text
			  try {
				const extracted = await fetchAndExtract({ url: article.link, userAgent: USER_AGENT });
				articleText = extracted.text;
				finalUrl = extracted.link;
			  } catch (e) {
				warn('Article fetch/extract failed:', e.message);
				appendLine(logPath, title);
				continue;
			  }
		  }
		  
		  // Summarize with Gemini using local content
		  let summary;
		  try {
			summary = await summarizeWithGemini({
			  apiKey: GOOGLE_API_KEY,
			  flyText: title,
			  articleText: articleText,
			});
		  } catch (e) {
			warn('Gemini summarize failed:', e.message);
			appendLine(logPath, title);
			continue;
		  }
		  
		  // Cycle through webhook keys
		  let webhookKey = webhookKeys[0];
		  if(!useFirstWebhook) webhookKey = webhookKeys[1];
		  useFirstWebhook = !useFirstWebhook;
		  const webhookUrl = WEBHOOKS[webhookKey];

		  // Send to Discord
		  try {
			await postToDiscord({ webhookUrl, category, headline: title, articleUrl: (finalUrl ? finalUrl : ""), summary, tickers: validTickers.join(","), israelTime });
		  } catch (e) {
			warn('Discord post failed:', e.message);
		  }

		  // Finally mark as processed
		  appendLine(logPath, title);
	  }
    }

    log('Done.');
  } catch (e) {
    error('Fatal error:', e);
    process.exitCode = 1;
  }
}

main();
