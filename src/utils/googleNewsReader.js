import axios from 'axios';
import * as cheerio from 'cheerio';

// Function to extract the final article URL from a Google News RSS URL
async function getArticleUrl(googleRssUrl) {
  try {
    // Fetch the Google News page
    const response = await axios.get(googleRssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Connection': 'keep-alive'
      },
      responseType: 'text'
    });

    // Parse the HTML with cheerio
    const $ = cheerio.load(response.data);
    const dataP = $('c-wiz[data-p]').attr('data-p');
    if (!dataP) {
      throw new Error('Could not find data-p attribute in c-wiz element');
    }

    // Parse the data-p attribute into a JSON object
    const obj = JSON.parse(dataP.replace('%.@.', '["garturlreq",'));

    // Prepare the payload for the batchexecute POST request
    const payload = {
      'f.req': JSON.stringify([[['Fbv4je', JSON.stringify([...obj.slice(0, -6), ...obj.slice(-2)]), 'null', 'generic']]])
    };

    // Set headers for the POST request
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    };

    // Make the POST request to batchexecute
    const postResponse = await axios.post('https://news.google.com/_/DotsSplashUi/data/batchexecute', payload, { headers });
    const arrayString = JSON.parse(postResponse.data.replace(")]}'", ""))[0][2];
    const articleUrl = JSON.parse(arrayString)[1];

    return articleUrl;
  } catch (error) {
    console.error('Error extracting article URL:', error.message);
    throw error;
  }
}

// Function to fetch the raw HTML of the final article URL
export async function fetchFinalHtml(googleNewsUrl) {
  try {
    // Step 1: Get the final article URL
    const articleUrl = await getArticleUrl(googleNewsUrl);
    console.log(`Final article URL: ${articleUrl}`);

    // Step 2: Fetch the raw HTML of the final URL
    const response = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Connection': 'keep-alive'
      },
      responseType: 'text',
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Only accept 2xx statuses
      }
    });

    return {
      finalUrl: articleUrl,
      html: response.data
    };
  } catch (error) {
    console.error('Error fetching final HTML:', error.message);
    throw error;
  }
}
