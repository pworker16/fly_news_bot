import "dotenv/config";
import axios from 'axios';
import { log, warn } from './utils/logger.js';
import { GROUPS_TAG } from './categorize.js';


function formatTickers(inputString) {
  // Split the input string by commas and trim whitespace
  const tickers = inputString.split(',').map(ticker => ticker.trim());
  
  // Add $ prefix to each ticker if not already present
  const formattedTickers = tickers.map(ticker => {
		const cleanTicker = ticker.startsWith('$') ? ticker.slice(1) : ticker;
		return `[$${cleanTicker}](<https://www.tradingview.com/chart/?symbol=${cleanTicker}>)`
	}
  );
  
  // Join the tickers back into a string
  return formattedTickers.join(', ');
}

export async function postToDiscord({ webhookUrl, category, headline, articleUrl, summary, tickers, publishDatetime }) {
	console.log("publishDatetime: ", publishDatetime);
	
if (!webhookUrl) {
	warn('No webhook configured for category', category);
	return false;
}

var tag = `\n\n${publishDatetime}`;

const mapped = GROUPS_TAG.get(category);
if (mapped) tag = `\n\n<@&${process.env[mapped.toLowerCase()]}>\n${publishDatetime}`;

var tickersLine = "";
if (tickers) {
	log("there are tickers: ", tickers);
	tickersLine = `${formatTickers(tickers)}\n`;
}

let articleLink = "";
if(articleUrl) articleLink = `\n\n**[קישור לכתבה](<${articleUrl}>)**`;

const content = `${tickersLine}${summary}${tag}${articleLink}`;

await axios.post(webhookUrl, { content: content }, { timeout: 15_000 });
log('Posted to Discord:', headline);

return true;
}