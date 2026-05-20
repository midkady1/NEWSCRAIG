const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

exports.analyzeNews = async (headline) => {
  try {
    const model = genAI.getGenerativeModel({
      model: config.gemini.model
    });

    const prompt = `
Ты профессиональный макроэкономический и геополитический аналитик.

ВАЖНО:
- Отвечай ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.
- Переведи заголовок на русский.
- Аналитика должна быть полностью на русском.
- Форматируй красиво для Telegram.
- Делай кратко, но профессионально.

Новость:
"${headline}"

Верни ответ строго в таком формате:

📌 Заголовок (RU):
...

📊 Аналитика:
...

📈 Влияние на рынки:
...

🎯 Активы:
...

🔥 Уверенность:
...%
`;

    const result = await model.generateContent(prompt);

    return result.response.text();
  } catch (err) {
    return `Ошибка Gemini: ${err.message}`;
  }
};
