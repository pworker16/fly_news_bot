import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import stringSimilarity from 'string-similarity';
import { isFresh } from './utils/time.js';
import { log } from './utils/logger.js';

function cleanTitle(t) {
  if (!t) return '';
  return t
    .replace(/[»“”"‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function variantsForQuery(title) {
  const v = new Set();
  const original = title || '';
  const cleaned = cleanTitle(original);

  v.add(original);
  v.add(cleaned);

  // אם יש נקודתיים – נסה גם את החלק שאחרי
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx > -1 && colonIdx < cleaned.length - 1) {
    v.add(cleaned.slice(colonIdx + 1).trim());
  }
  // וגם את החלק שלפני (לפעמים הכותרת לפני הנקודתיים היא העיקר)
  if (colonIdx > 0) {
    v.add(cleaned.slice(0, colonIdx).trim());
  }

  // גרסה בלי תווים שאינם אות/מספר/רווח
  v.add(cleaned.replace(/[^a-zA-Z0-9 %$]/g, ' ').replace(/\s+/g, ' ').trim());

  // הורד גרשיים בודדים שיכולים לבלגן את החיפוש
  v.add(cleaned.replace(/'/g, '').trim());

  // סנן ריקות
  return Array.from(v).filter(x => x);
}

async function searchRssOnce(query, windowMin, lang, region) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(region)}&ceid=${encodeURIComponent(region)}:${encodeURIComponent(lang)}`;
  log('RSS search:', rssUrl);
  const res = await axios.get(rssUrl, { timeout: 20000 });
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(res.data);
  const items = xml?.rss?.channel?.item || [];
  if (!items.length) return [];

  return items.map(it => {
    const pub = it.pubDate ? new Date(it.pubDate) : null;
    return {
      title: it.title || '',
      link: it.link || '',
      pubDate: pub,
      source: it?.source?.['#text'] || '',
    };
  }).filter(x => x.link && x.title && x.pubDate && isFresh(x.pubDate, windowMin));
}

/**
 * נסה כמה וריאציות של הכותרת, ובחר את ההתאמה הטובה ביותר בטווח הזמן.
 */
export async function findRecentArticle({ query, windowMin = 60, lang = 'en-US', region = 'US' }) {
  const variants = variantsForQuery(query);
  let best = null;

  for (const q of variants) {
    const candidates = await searchRssOnce(q, windowMin, lang, region);
    if (!candidates.length) continue;

    const scored = candidates
      .map(m => ({ m, score: stringSimilarity.compareTwoStrings(cleanTitle(query), cleanTitle(m.title)) }))
      .sort((a, b) => b.score - a.score);

    const top = scored[0];
    // סף מינימלי לרלוונטיות – אפשר לכוון אם צריך
    if (!best || top.score > best.score) {
      best = top;
    }
  }

  return best?.m || null;
}
