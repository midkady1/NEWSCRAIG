const { Bot } = require('grammy');
const config = require('../config');

const bot = new Bot(config.telegram.token);

exports.sendMessage = async (message) => {
  if (!config.telegram.channel) return;

  await bot.api.sendMessage(
    config.telegram.channel,
    message,
    { parse_mode: 'Markdown' }
  );
};
