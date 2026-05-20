import RSSParser from "rss-parser";

process.setMaxListeners(50);

const parser = new RSSParser();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const POLL_INTERVAL_MS = 8000;
const CALENDAR_INTERVAL_MS = 60000;

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
  "waller",
  "jefferson",
  "bostic",
  "mester",
  "barkin",
  "daly",
  "williams",
  "kashkari",
  "cook",
  "bowman",
  "goolsbee",
  "logan",
  "harker",
  "collins",
  "musalem",
  "kugler",
  "kevin warsh"
];

const seenNews = new Set();
const seenCalendar = new Set();

async function sendTelegram(message) {

  const url =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    })
  });

}

function containsFedSpeaker(text) {

  const lower = text.toLowerCase();

  return FED_SPEAKERS.some(
    speaker => lower.includes(speaker)
  );

}

function buildImpact(title) {

  const lower = title.toLowerCase();

  if (
    lower.includes("cpi") ||
    lower.includes("inflation") ||
    lower.includes("powell") ||
    lower.includes("fomc") ||
    lower.includes("nfp")
  ) {
    return "🔥 HIGH IMPACT";
  }

  if (
    lower.includes("iran") ||
    lower.includes("trump") ||
    lower.includes("tariff")
  ) {
    return "⚠️ GEO IMPACT";
  }

  return "ℹ️ MARKET UPDATE";

}

async function checkFeed(feedConfig) {

  try {

    const feed =
      await parser.parseURL(feedConfig.url);

    for (const item of feed.items.slice(0, 5)) {

      const title = item.title?.trim();

      if (!title) continue;

      if (seenNews.has(title)) continue;

      seenNews.add(title);

      const impact = buildImpact(title);

      const message = `
📰 ${impact}

${title}
`;

      await sendTelegram(message);

      console.log(
        "[NEWS]",
        title
      );

    }

  } catch (err) {

    console.log(
      "Feed error:",
      err
    );

  }

}

async function checkAllFeeds() {

  for (const feed of FEEDS) {

    await checkFeed(feed);

  }

}

async function checkCalendarReminders() {

  try {

    const response =
      await fetch(CALENDAR_URL);

    const events =
      await response.json();

    const now = Date.now();

    for (const event of events) {

      const title =
        event.title || "";

      if (
        !containsFedSpeaker(title)
      ) continue;

      const eventTime =
        new Date(
          `${event.date} ${event.time} UTC`
        ).getTime();

      const diffMinutes =
        Math.floor(
          (eventTime - now) / 60000
        );

      if (
        diffMinutes <= 30 &&
        diffMinutes >= 0
      ) {

        const uniqueKey =
          `${title}-${event.date}-${event.time}`;

        if (
          seenCalendar.has(uniqueKey)
        ) continue;

        seenCalendar.add(uniqueKey);

        const impact =
          buildImpact(title);

        const message = `
📅 FED SPEAKER ALERT

🎤 ${title}

🕒 ${event.time} UTC
📆 ${event.date}

📊 Forecast:
${event.forecast || "N/A"}

📉 Previous:
${event.previous || "N/A"}

${impact}

🕓 Prepare for volatility.
`;

        await sendTelegram(message);

        console.log(
          "[CALENDAR]",
          event.title
        );

      }

    }

  } catch (err) {

    console.error(
      "Calendar error:",
      err
    );

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