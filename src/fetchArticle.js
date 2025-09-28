import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { log } from './utils/logger.js';
import { fetchFinalHtml } from './utils/googleNewsReader.js';


/**
 * Download raw HTML and extract readable text via Mozilla Readability.
 * Falls back gracefully if parsing fails.
 */
export async function fetchAndExtract({ url, userAgent }) {
  log('Fetching article HTML:', url);
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    responseType: 'text',
    headers: {
      'User-Agent': userAgent || 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  
  const { finalUrl, html } = await fetchFinalHtml(url);
  
  let text = '';
  let link = finalUrl;
  
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    text = (article?.textContent || '').trim();
  } catch (_) {
    // Fallback: naive tag-strip
    text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
               .replace(/<style[\s\S]*?<\/style>/gi, ' ')
               .replace(/<[^>]+>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
  }

  return { link, text };
}
