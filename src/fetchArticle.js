import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { log } from './utils/logger.js';
import { fetchFinalHtml } from './utils/googleNewsReader.js';

/**
 * Remove non-content elements from DOM before readability parsing
 */
function removeNonContentElements(document) {
  // Common selectors for non-content elements
  const selectorsToRemove = [
    // Navigation
    'nav', '[role="navigation"]', '.nav', '.navigation', '.navbar', '.menu',
    '.breadcrumb', '.breadcrumbs', '.site-nav', '.main-nav',
    
    // Headers and footers
    'header', 'footer', '.header', '.footer', '.site-header', '.site-footer',
    '.page-header', '.page-footer', '.main-header', '.main-footer',
    
    // Sidebars and widgets
    'aside', '.sidebar', '.widget', '.widgets', '.side-nav', '.secondary',
    '.complementary', '[role="complementary"]',
    
    // Advertisements
    '.ad', '.ads', '.advertisement', '.banner', '[class*="sponsor"]',
    '[class*="promo"]', '.promoted', '.native-ad', '.google-ad',
    
    // Social and sharing
    '.social', '.share', '.sharing', '.social-share', '.follow',
    '.social-media', '.social-links', '.share-buttons',
    
    // Comments
    '.comments', '.comment', '.comment-section', '.disqus', '.fb-comments',
    '#comments', '.wp-comment', '.comment-form',
    
    // Related content
    '.related', '.recommended', '.more-stories', '.also-read', '.you-may-like',
    '.similar', '.trending', '.popular', '.most-read',
    
    // Newsletter/subscription
    '.newsletter', '.subscribe', '.subscription', '.signup', '.email-signup',
    '.mailing-list',
    
    // Cookie notices and overlays
    '.cookie', '.gdpr', '.privacy-notice', '.modal', '.overlay', '.popup',
    '.notification-bar',
    
    // Search
    '.search', '.search-form', '.search-box', '#search',
    
    // Skip links and accessibility
    '.skip-link', '.skip-to-content', '.sr-only', '.screen-reader-text',
    
    // Author boxes (often at bottom)
    '.author-box', '.author-bio', '.byline-author', '.post-author',
    
    // Tags and categories (metadata)
    '.tags', '.categories', '.tag-list', '.category-list', '.post-meta',
    
    // Print styles
    '.print-only', '.no-print'
  ];
  
  // Remove elements by selector
  selectorsToRemove.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });
  
  // Remove elements by common class name patterns
  const classPatterns = [
    /ad[-_]?/i,
    /banner[-_]?/i,
    /sponsor[-_]?/i,
    /promo[-_]?/i,
    /widget[-_]?/i,
    /sidebar[-_]?/i,
    /nav[-_]?/i,
    /menu[-_]?/i,
    /footer[-_]?/i,
    /header[-_]?/i,
    /social[-_]?/i,
    /share[-_]?/i,
    /comment[-_]?/i,
    /related[-_]?/i,
    /recommended[-_]?/i,
    /trending[-_]?/i,
    /popular[-_]?/i
  ];
  
  const allElements = document.querySelectorAll('[class]');
  allElements.forEach(el => {
    const className = el.className.toLowerCase();
    if (classPatterns.some(pattern => pattern.test(className))) {
      el.remove();
    }
  });
  
  // Remove script and style tags (redundant but safe)
  document.querySelectorAll('script, style, noscript').forEach(el => el.remove());
  
  // Remove hidden elements
  document.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach(el => el.remove());
  document.querySelectorAll('[hidden]').forEach(el => el.remove());
  
  // Remove elements with minimal text content that are likely navigation
  const suspiciousElements = document.querySelectorAll('div, span, section');
  suspiciousElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    const hasLinks = el.querySelectorAll('a').length > 3;
    const shortText = text.length < 100;
    const hasNavKeywords = /^(home|about|contact|menu|subscribe|follow|share|tweet|like)$/i.test(text);
    
    if ((hasLinks && shortText) || hasNavKeywords) {
      el.remove();
    }
  });
}

/**
 * Download raw HTML and extract readable text via Mozilla Readability.
 * Falls back gracefully if parsing fails.
 */
export async function fetchAndExtract({ url, userAgent }) {
  log('Fetching article HTML:', url);
  // const res = await axios.get(url, {
  //   timeout: 20000,
  //   maxRedirects: 5,
  //   responseType: 'text',
  //   headers: {
  //     'User-Agent': userAgent || 'Mozilla/5.0',
  //     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  //   }
  // });
  
  const { finalUrl, html } = await fetchFinalHtml(url);
  
  let text = '';
  let link = finalUrl;
  
  try {
    const dom = new JSDOM(html, { url });
    
    // Clean up the DOM before Readability processing
    removeNonContentElements(dom.window.document);
    
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    text = (article?.textContent || '').trim();
    
    // If Readability didn't find much content, try the cleaned HTML
    if (text.length < 100) {
      text = dom.window.document.body?.textContent?.trim() || '';
    }
  } catch (error) {
    log('Readability parsing failed, using fallback:', error.message);
    
    // Enhanced fallback: remove non-content elements via regex before tag stripping
    let cleanedHtml = html
      // Remove script and style tags
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      
      // Remove common non-content elements
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
      
      // Remove elements with common class patterns
      .replace(/<[^>]*class=[^>]*(?:nav|menu|sidebar|widget|ad|banner|social|share|comment|related|footer|header)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
      
      // Remove all HTML tags
      .replace(/<[^>]+>/g, ' ')
      
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    text = cleanedHtml;
  }
  
  return { link, text };
}