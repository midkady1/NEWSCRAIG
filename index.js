module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    channel: process.env.TELEGRAM_CHANNEL
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro'
  },

  rss: {
    intervalMs: Number(process.env.RSS_INTERVAL_MS || 15000)
  }
};
