const Parser = require('rss-parser');
const parser = new Parser();

const config = require('../config');
const { logger } = require('../utils/logger');
const { isDuplicate } = require('../utils/dedupe');
const { evaluateNews } = require('../engine/rulesEngine');
const { analyzeNews } = require('./geminiService');
const { sendMessage } = require('./telegramService');

const FEEDS = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://www.cnbc.com/id/100003114/device/rss/rss.html'
];

async function pollFeeds() {
  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);

      for (const item of feed.items.slice(0, 5)) {
        const title = item.title || '';

        if (isDuplicate(title)) continue;

        const analytics = evaluateNews(title);

        if (analytics.confidence < 25) continue;

        const llm = await analyzeNews(title);

        const msg = `
🚨 *NEWSCRAIG PRO*

${llm}

📡 Source:
${feed.title || 'RSS Feed'}
`;

        await sendMessage(msg);

        logger.info(`Sent signal: ${title}`);
      }
    } catch (err) {
      logger.error(err.message);
    }
  }
}

exports.startPolling = async () => {
  logger.info('RSS polling started');

  setInterval(pollFeeds, config.rss.intervalMs);

  await pollFeeds();
};
