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

// === helpers ===
const STOPWORDS = new Set([
  'the','a','an','and','or','of','for','on','in','to','from','with','by','at','as','is','are',
  'short','report','breaking','update','news','latest','today','stocks','market','hot','fly'
]);

function extractKeywords(title) {
  const words = cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s$.-]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w) && (w.length >= 4 || /^\$?[A-Z]{1,5}$/.test(w)));
  return Array.from(new Set(words));
}

function hasAllOrMostKeywords(candidateTitle, required, minMatch = Math.min(2, required.length)) {
  const t = cleanTitle(candidateTitle).toLowerCase();
  let hits = 0;
  for (const k of required) {
    if (t.includes(k)) hits++;
  }
  const need = required.length <= 2 ? required.length : Math.max(minMatch, Math.ceil(required.length * 0.6));
  return hits >= need;
}

function penalizedSimilarity(a, b) {
  const A = cleanTitle(a), B = cleanTitle(b);
  const raw = stringSimilarity.compareTwoStrings(A, B);
  const lenRatio = Math.min(A.length, B.length) / Math.max(A.length, B.length);
  return raw * lenRatio;
}

const DOMAIN_WHITELIST = new Set([
  'reuters.com','bloomberg.com','cnbc.com','finance.yahoo.com','seekingalpha.com',
  'wsj.com','marketwatch.com','thestreet.com','investors.com','fool.com','apnews.com',
  'prnewswire.com','businesswire.com','globenewswire.com','thefly.com','barrons.com'
]);

const DOMAIN_BLACKLIST = new Set([
  'news.stocktradersdaily.com','seekingalpha.com/instablog',
]);

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; }
}

// === מחליף את הפונקציה הקיימת ===
function variantsForQuery(title) {
  const v = new Set();
  const original = title || '';
  const cleaned = cleanTitle(original);

  v.add(original);
  v.add(cleaned);

  const colonIdx = cleaned.indexOf(':');
  if (colonIdx > -1 && colonIdx < cleaned.length - 1) v.add(cleaned.slice(colonIdx + 1).trim());
  if (colonIdx > 0) v.add(cleaned.slice(0, colonIdx).trim());

  v.add(`"${cleaned}"`);
  v.add(cleaned.replace(/[^a-zA-Z0-9 %$]/g, ' ').replace(/\s+/g, ' ').trim());

  const MIN_WORDS = 3;
  const MIN_LENGTH = 15;
  const forbiddenSingles = new Set(['short report','report','breaking news','breaking']);

  return Array.from(v).filter(x => {
    const s = (x || '').trim();
    if (!s) return false;
    const plain = s.replace(/"/g,'').toLowerCase();
    if (forbiddenSingles.has(plain)) return false;
    const words = plain.split(/\s+/);
    return s.length >= MIN_LENGTH && words.length >= MIN_WORDS;
  });
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



// === מחליף את הפונקציה הקיימת ===
export async function findRecentArticle({ query, windowMin = 60, lang = 'en-US', region = 'US' }) {
  const variants = variantsForQuery(query);
  const requiredKeywords = extractKeywords(query);
  const SCORE_THRESHOLD = 0.60;

  let best = null;

  for (const q of variants) {
    const candidates = await searchRssOnce(q, windowMin, lang, region);
    if (!candidates?.length) continue;

    const filtered = candidates.filter(m => {
      const url = m.link || m.url || '';
      const host = hostnameOf(url);
      if (host && DOMAIN_BLACKLIST.has(host)) return false;
      const kwOK = requiredKeywords.length ? hasAllOrMostKeywords(m.title || '', requiredKeywords) : true;
      return kwOK;
    });

    if (!filtered.length) continue;

    const scored = filtered.map(m => {
      const sim = penalizedSimilarity(query, m.title || '');
      const host = hostnameOf(m.link || m.url || '');
      const bonus = DOMAIN_WHITELIST.has(host) ? 1.05 : 1.0;
      return { m, score: sim * bonus };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];

    if (top && top.score >= SCORE_THRESHOLD && hasAllOrMostKeywords(top.m.title || '', requiredKeywords)) {
      if (!best || top.score > best.score) best = top;
    }
  }

  return best?.m || null;
}

