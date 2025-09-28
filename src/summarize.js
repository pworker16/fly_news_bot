import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from './utils/logger.js';

/**
 * Summarize using Gemini **without web access**.
 * We pass the Fly headline, the article URL (for reference), and the extracted
 * article text + a small slice of raw HTML for extra context.
 */
export async function summarizeWithGemini({ apiKey, flyText, articleText }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const MAX_TEXT = Number(process.env.MAX_TEXT_CHARS || 20000);
  const MAX_HTML = Number(process.env.MAX_HTML_CHARS || 4000);

  const safeText = (articleText || '').slice(0, MAX_TEXT);

  const prompt = [
    'הוראות:',
    'אתה מסכם ומתרגם כתבות לסוחרי ריטייל בשוק ההון האמריקאי בבורסת נאסדק ובורסת ניו יורק.',
    'תרגם וסכם בשניים שלושה משפטים בעברית. שמור על דיוק עובדתי בלבד. אל תוסיף כותרת.',
    "התשובה שלך צריכה להתאים לפוסט דיסקורד אז תוסיף אימוג'יס כשרלוונטי, נסה לא להשתמש במילים באנגלית כשאפשר",
    'התרכז בנושא המרכזע, התעלם מתפריטים, דיסקליימר, תקנון או מדיניות כזו או אחרת שמופיעה בדף האינטרנט',
    '',
    'הקשר:',
    `• נושא הכתבה: ${flyText || ''}`,
    '',
    'תוכן הכתבה (דף מאתר האינטרנט):',
    safeText
  ].join('\n');
  
  log('prompt: ', prompt);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return text.trim();
}
