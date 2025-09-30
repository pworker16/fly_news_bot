import "dotenv/config";
import { chromium } from 'playwright';
import { log, warn } from './utils/logger.js';

export async function fetchLatestHeadlines({ url, limit = 10, userAgent, headless = true }) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ userAgent });
  const page = await ctx.newPage();

  const PAGES_TO_SCROLL = process.env.PAGES_TO_SCROLL || 2;
  
  // Forward page console logs to Node
//  page.on('console', msg => log('[page]', msg.type().toUpperCase(), msg.text()));

  log('Opening', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.waitForSelector('table tbody tr', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Scroll 2 or more viewport-heights to trigger lazy loading
  for (let i = 0; i < PAGES_TO_SCROLL; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 4));
	log(`Scrolled ${i + 1}/${PAGES_TO_SCROLL}`);

  await page.waitForTimeout(1000); // Increased wait for stability

  }
  // Optional: go back to the top so later anchors/links are in view
  await page.evaluate(() => window.scrollTo(0, 0));

  const rows = await page.evaluate((max) => {
    const trs = Array.from(document.querySelectorAll('table tbody tr'));
	console.log(`found: ${trs.length} trs.`);
    const out = [];

    for (const tr of trs) {
      const titleEl = tr.querySelector('a.newsTitleLink, a');
      if (!titleEl) continue;

      const title = titleEl.textContent?.trim();
      if (!title) continue;
      const titleLink = titleEl.href?.trim();
	  if (title.includes("Show Full Stories")) continue;

      const icon = tr.querySelector('td.story_type span.icon_story_type');
      const iconClass = icon
        ? Array.from(icon.classList).find(c => c !== 'icon_story_type') || ''
        : '';
      const iconLabel = icon?.getAttribute('data-name') || '';
      const topicAttr = tr.getAttribute('data-topic') || '';
	  
	  const timeAttr = tr.getAttribute('data-datenews') || '';

	// ADD: collect tickers from the symbols wrapper
	const symbolsWrap = tr.querySelector('.simbolos_wrapper'); // note: 'simbolos', not 'symbols'
	const tickersArr = symbolsWrap
	  ? Array.from(symbolsWrap.querySelectorAll('span.ticker'))
		  .map(el => (el.getAttribute('data-ticker') || el.textContent || '').trim())
		  .filter(Boolean)
	  : [];
	const tickersText = Array.from(new Set(tickersArr)).join(', ');

      if (!iconClass) continue;
      // DEBUG: run in page context
      console.log(`icon: ${icon}, iconClass: ${iconClass}`);

      out.push({
        title,
		titleLink,
        rawCategory: iconClass || topicAttr || iconLabel || '',
        rawCategoryClass: iconClass,
        rawCategoryLabel: iconLabel,
        rawTopic: topicAttr,
		tickers: tickersText,
		publishDatetime: timeAttr,
      });
      if (out.length >= max) break;
    }
    return out;
  }, limit);

  await browser.close();

	// sort newest last (based on publishDatetime)
	rows.sort((a, b) => new Date(b.publishDatetime) - new Date(a.publishDatetime));

  // Also log what we parsed (Node side)
  for (const r of rows) {
    log(`parsed: title="${r.title}" | class=${r.rawCategoryClass} | label="${r.rawCategoryLabel}" | topic="${r.rawTopic}" | tickers="${r.tickers}"`);
  }

  log(`Fetched ${rows.length} headlines.`);
  if (!rows.length) warn('No rows parsed – selectors may need tweaking.');
  
  return rows;
}
