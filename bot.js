import RSSParser from "rss-parser";
import { TwitterApi } from "twitter-api-v2";

process.setMaxListeners(50);

const parser = new RSSParser();

async function postToTwitter(text) {
  try {

    const tweet = `🚨 BREAKING:\n\n${text}`;

    await twitterClient.v2.tweet(tweet);

    console.log("✅ Posted to X");

  } catch (err) {

    console.log("Twitter error:", err);

  }
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const POLL_INTERVAL_MS = 60_000;
const CALENDAR_INTERVAL_MS = 60_000;

const CALENDAR_URL =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const FEEDS = [

  // 🔥 FAST MACRO / CENTRAL BANKS
  {
    url: "https://www.forexlive.com/feed/news"
  },

  // 🔥 FX MACRO
  {
    url: "https://www.fxstreet.com/rss/news"
  },

  // 🔥 INVESTING LIVE
  {
    url: "https://investinglive.com/feed/news/"
  },

  // 🔥 OIL / COMMODITIES
  {
    url: "https://oilprice.com/rss/main"
  },

  // 🔥 BREAKING NEWS
  {
    url: "https://www.financialjuice.com/feed.ashx"
  }

];


const FED_SPEAKERS = [
  "powell",
  "warsh",
  "kevin warsh",
  "waller",
  "bostic",
  "jefferson",
  "kashkari",
  "daly",
  "williams",
  "federal reserve",
  "fed governor",
];

const GOOD_KEYWORDS = [
  "fed",
  "fomc",
  "powell",
  "warsh",
  "kevin warsh",
  "waller",
  "federal reserve",
  "fed governor",
  "ecb",
  "boe",
  "boj",
  "rba",
  "rates",
  "rate hike",
  "rate cut",
  "cpi",
  "inflation",
  "core inflation",
  "pce",
  "nfp",
  "payrolls",
  "unemployment",
  "gdp",
  "pmi",
  "retail sales",
  "tariffs",
  "china",
  "trump",
  "oil",
  "opec",
  "war",
  "missile",
  "sanctions",
  "treasury",
  "yields",
  "dollar",
  "gold",
  "risk off",
  "risk-on",
  "recession",
  "hawkish",
  "dovish",
];

const NOISE_BLACKLIST = [
  "earnings",
  "quarterly",
  "dividend",
  "buyback",
  "ipo",
  "acquisition",
  "revenue",
  "guidance",
  "shares fell",
  "shares rose",
  "trillion dollar opportunity",
  "green tech",
  "ai race",
  "plastic waste",
];

const sentArticles = new Set();
const semanticCache = new Set();
const sentReminders = new Set();

const EVENT_IMPACT_RULES = {
  cpi: {
    assets: ["GBP/USD", "GBP/JPY", "GBP/NZD"],
    focus: "Core CPI и services inflation",
    hot: "🔥 Инфляция выше ожиданий = bullish GBP / hawkish BOE",
    cold: "📉 Инфляция ниже ожиданий = bearish GBP",
  },

  nfp: {
    assets: ["EUR/USD", "Gold", "DXY", "USD/JPY"],
    focus: "Average Hourly Earnings и revisions",
    hot: "🔥 Сильный рынок труда = bullish USD",
    cold: "📉 Слабый NFP = bearish USD / bullish Gold",
  },

  fomc: {
    assets: ["DXY", "Gold", "NASDAQ", "US10Y"],
    focus: "Tone ФРС / ставки / future policy",
    hot: "🦅 Hawkish Fed = bullish USD",
    cold: "🕊 Dovish Fed = bullish equities",
  },

  tariffs: {
    assets: ["Gold", "AUD/USD", "USD/CNH", "NASDAQ"],
    focus: "Risk sentiment",
    hot: "⚠️ Тарифы обычно вызывают risk-off",
    cold: "✅ De-escalation = risk-on",
  },

  oil: {
    assets: ["WTI", "Brent", "CAD", "Inflation"],
    focus: "Supply shocks / OPEC",
    hot: "🛢 Рост нефти = inflationary",
    cold: "📉 Падение нефти = disinflationary",
  },
};

function normalizeText(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/gi, "").trim();
}

function semanticFingerprint(text) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 12)
    .sort()
    .join("|");
}

function detectCategory(text) {
  const t = text.toLowerCase();

  if (t.includes("cpi") || t.includes("inflation")) {
    return "cpi";
  }

  if (t.includes("nfp") || t.includes("payroll")) {
    return "nfp";
  }

  if (
    t.includes("fomc") ||
    FED_SPEAKERS.some((name) => t.includes(name))
  ) {
    return "fomc";
  }

  if (
    t.includes("tariff") ||
    t.includes("trade war")
  ) {
    return "tariffs";
  }

  if (
    t.includes("oil") ||
    t.includes("opec")
  ) {
    return "oil";
  }

  return null;
}

function buildImpactAnalysis(category) {
  const data = EVENT_IMPACT_RULES[category];

  if (!data) return "";

  return `
📊 *Market Impact*
• ${data.hot}
• ${data.cold}

🎯 *Рынок смотрит:*
${data.focus}

📈 *Главные активы:*
${data.assets.join(", ")}
`;
}

function calculatePriority(text) {
  const t = text.toLowerCase();

  if (t.includes("emergency")) return "🔴 EXTREME";

  if (
    t.includes("fomc") ||
    FED_SPEAKERS.some((name) => t.includes(name))
  ) {
    return "🔴 HIGH";
  }

  if (t.includes("cpi")) return "🔴 HIGH";

  if (t.includes("nfp")) return "🔴 HIGH";

  if (t.includes("war")) return "🔴 HIGH";

  if (t.includes("tariff")) return "🟠 MEDIUM";

  return "🟢 NORMAL";
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const payload = {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    text,
  };

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      ...payload,
      chat_id: TELEGRAM_CHAT_ID,
    }),
  });

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      ...payload,
      chat_id: TELEGRAM_CHANNEL,
    }),
  });
}

async function checkFeed(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);

    for (const entry of feed.items.slice(0, 10)) {
      const title = entry.title || "";
      const description = entry.contentSnippet || "";

      const fullText =
        `${title} ${description}`.toLowerCase();

      if (
        !GOOD_KEYWORDS.some((k) =>
          fullText.includes(k)
        )
      ) {
        continue;
      }

      if (
        NOISE_BLACKLIST.some((k) =>
          fullText.includes(k)
        )
      ) {
        continue;
      }

      const fingerprint =
        semanticFingerprint(title);

      if (semanticCache.has(fingerprint)) {
        continue;
      }

      semanticCache.add(fingerprint);

      if (sentArticles.has(title)) {
        continue;
      }

      sentArticles.add(title);

      const category =
        detectCategory(fullText);

      const impact =
        buildImpactAnalysis(category);

      const priority =
        calculatePriority(fullText);

      let riskTone = "";

      if (
        fullText.includes("tariff") ||
        fullText.includes("missile") ||
        fullText.includes("attack")
      ) {
        riskTone =
          "⚠️ *Risk-Off Sentiment Possible*";
      }

      if (
        fullText.includes("rate cut") ||
        fullText.includes("stimulus")
      ) {
        riskTone =
          "📈 *Risk-On Sentiment Possible*";
      }

      const message = `
${priority} *NEWS CRAIG*

📰 *${title}*

${impact}

${riskTone}

🔗 ${entry.link}
`.slice(0, 4000);

      await sendTelegram(message);

      console.log("[NEWS]", title);

      await new Promise((r) =>
        setTimeout(r, 2500)
      );
    }
  } catch (err) {
    console.error("Feed error:", err);
  }
}

async function checkAllFeeds() {
  for (const feed of FEEDS) {
    await checkFeed(feed.url);
  }
}

async function checkCalendarReminders() {
  try {
    const res = await fetch(CALENDAR_URL);

    if (!res.ok) return;

    const events = await res.json();

    const now = Date.now();

    for (const event of events) {
      if (event.impact !== "High") continue;

      const minutesUntil =
        (new Date(event.date).getTime() - now) /
        60000;

      if (
        minutesUntil < 14 ||
        minutesUntil > 16
      ) {
        continue;
      }

      const key =
        `${event.title}-${event.date}`;

      if (sentReminders.has(key)) {
        continue;
      }

      sentReminders.add(key);

      const lower =
        event.title.toLowerCase();

      const category =
        detectCategory(lower);

      const impact =
        buildImpactAnalysis(category);

      const message = `
⏰ *HIGH IMPACT EVENT IN 15 MINUTES*

📌 *${event.title}*

📊 Forecast:
${event.forecast || "N/A"}

📉 Previous:
${event.previous || "N/A"}

${impact}

🕒 Prepare for volatility.
`;

      await sendTelegram(message);
      
      await postToTwitter(message);
      
      console.log(
        "[CALENDAR]",
        event.title
      );
    }
  } catch (err) {
    console.error("Calendar error:", err);
  }
}

console.log(
  "🚀 NEWS CRAIG TERMINAL STARTED"
);

checkAllFeeds();

checkCalendarReminders();

setInterval(
  checkAllFeeds,
  POLL_INTERVAL_MS
);

setInterval(
  checkCalendarReminders,
  CALENDAR_INTERVAL_MS
);