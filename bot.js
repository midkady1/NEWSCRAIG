import RSSParser from "rss-parser";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const POLL_INTERVAL_MS = 15_000;
const CALENDAR_INTERVAL_MS = 60_000;
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const FEEDS = [
  { url: "https://finance.yahoo.com/news/rssindex" },
  { url: "https://finance.yahoo.com/rss/topfinstories" },
  { url: "https://www.forexlive.com/feed/news" },
];

const GOOD_KEYWORDS = [
  "trump", "warsh", "tariffs", "sanctions", "trade war", "white house",
  "executive order", "tariff exemption", "tariff pause",
  "trade deal", "trade agreement", "scott bessent", "g7", "g20",
  "oil", "opec", "opec+", "wti", "brent", "crude", "eia", "energy",
  "spr", "mideast", "red sea", "iran", "iraq", "saudi", "natural gas", "lng",
  "gold", "silver", "xau", "xag", "palladium", "platinum", "bullion",
  "safe haven", "copper", "aluminum",
  "fed", "fomc", "waller", "federal reserve", "rate decision",
  "ecb", "lagarde", "boe", "bailey", "boj", "rba", "rate hike", "rate cut",
  "interest rate", "hawkish", "dovish",
  "nfp", "nonfarm", "unemployment", "cpi", "pce", "inflation",
  "gdp", "pmi", "retail sales", "treasury yields",
  "dollar index", "dxy", "usd", "eur/usd", "gbp/usd", "usd/jpy",
  "forex", "currency intervention", "yen intervention",
  "china pmi", "caixin", "russia sanctions", "ukraine war",
  "war", "conflict", "nuclear", "missile", "attack",
  "default", "recession", "bank run", "collapse", "credit crunch",
];

const VIP_KEYWORDS = [
  "fomc", "rate decision", "rate hike", "rate cut", "emergency",
  "nfp", "nonfarm payroll", "cpi", "inflation report",
  "powell", "lagarde", "warsh",
  "oil spike", "oil crash", "opec emergency", "opec+ emergency",
  "intervention", "default", "recession", "bank run", "collapse",
  "war", "attack", "nuclear", "missile", "explosion",
  "breaking", "flash", "urgent", "alert",
  "sanctions", "embargo",
  "trump announces", "trump signs", "executive order", "trump tariff",
  "tariffs on", "tariff hike", "tariff pause", "trade deal signed",
  "trump threatens", "trump warns", "white house announces",
  "trump fires", "trump nominates",
];

const STOCK_BLACKLIST = [
  "shares", "stock", "earnings", "revenue", "quarterly", "profit",
  "dividend", "ceo", "cfo", "coo", "acquisition", "merger", "buyback",
  "ipo", "valuation", "market cap", "listed", "delisted", "spinoff",
  "q1", "q2", "q3", "q4", "fiscal year", "annual report", "guidance",
  "beat estimates", "missed estimates", "eps", "per share",
  "nasdaq", "s&p 500", "dow jones", "nyse", "russell 2000",
  "ftse", "dax", "nikkei", "hang seng", "stoxx",
  "apple", "microsoft", "google", "alphabet", "amazon", "meta",
  "tesla", "nvidia", "berkshire", "jpmorgan", "goldman sachs",
  "exxon", "chevron", "shell", "bp ", "totalenergies",
  "bank of america", "citigroup", "wells fargo",
  "analyst rating", "price target", "upgrade", "downgrade",
  "outperform", "underperform", "buy rating", "sell rating",
  "hedge fund", "portfolio", "etf holdings",
  "immigration", "border wall", "abortion", "gun control",
  "election campaign", "poll shows", "approval rating",
  "healthcare bill", "education", "climate bill",
  "bitcoin", "ethereum", "crypto", "btc", "eth", "blockchain",
];

const CURRENCY_FLAG = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", All: "🌐",
};

// ─── State ────────────────────────────────────────────────────────────────────

const sentArticles = new Set();

function dedupeKey(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

const MAX_ARTICLE_AGE_MS = 20 * 60_000;
const MSG_SEND_DELAY_MS = 5_000;
const sentReminders = new Set();

const TRUTH_POLL_INTERVAL_MS = 30_000;
const TRUTH_ACCOUNT_LOOKUP = "https://truthsocial.com/api/v1/accounts/lookup?acct=realDonaldTrump";
const TRUTH_MAX_AGE_MS = 30 * 60_000;
const sentTruths = new Set();
let trumpAccountId = null;
let digestSentForWeek = "";
let dailyDigestSentForDay = "";

const parser = new RSSParser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVip(text) {
  return VIP_KEYWORDS.some((kw) => text.includes(kw));
}

function getLocalHHMM(tz) {
  const s = new Date().toLocaleTimeString("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [h, m] = s.replace("24:", "00:").split(":").map(Number);
  return { hour: h, minute: m };
}

function moscowHour() { return getLocalHHMM("Europe/Moscow").hour; }

function currentMoscowDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

function currentMoscowWeekKey() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const year = now.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = Math.ceil(
    ((now.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7
  );
  return `${year}-W${week}`;
}

function moscowDayOfWeek() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })).getDay();
}

// ─── Translation (LibreTranslate) ──────────────────────────────────────────

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";

async function translateToRussian(text) {
  if (!text || !text.trim()) return "";

  console.log(`[DEBUG] Перевожу текст длиной: ${text.length} символов`);

  try {
    const url = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
    console.log(`[DEBUG] Использую LibreTranslate: ${url}`);

    const res = await fetch(`${url}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: "ru",
        format: "text"
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[DEBUG] Перевод УДАЛСЯ`);
      return data.translatedText || text;
    } else {
      console.log(`[DEBUG] Ошибка HTTP: ${res.status}`);
    }
  } catch (err) {
    console.error(`[DEBUG] Ошибка LibreTranslate: ${err.message}`);
  }

  console.log(`[DEBUG] Возвращаю оригинал (английский)`);
  return text;
}

// === ТЕСТ ПЕРЕВОДА (чистый) ===
console.log("[TEST] Запускаю тестовый перевод...");
translateToRussian("Test translation: The market is reacting to Fed decision")
  .then(ru => console.log("[TEST] Результат:", ru))
  .catch(err => console.error("[TEST] Ошибка:", err.message));

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendToChat(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[TG] Error (${chatId}) ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(`[TG] Failed to send to ${chatId}:`, err.message);
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  await Promise.all([
    sendToChat(TELEGRAM_CHAT_ID, text),
    sendToChat(TELEGRAM_CHANNEL, text),
  ]);
}

// ─── News feed polling ────────────────────────────────────────────────────────

async function checkFeed(feedUrl, strict = false) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const now  = Date.now();

    for (const entry of feed.items.slice(0, 10)) {
      const titleEn = entry.title ?? "";
      const descEn  = entry.contentSnippet ?? entry.content ?? entry.summary ?? "";
      const link    = entry.link ?? "";

      const key = dedupeKey(titleEn);
      if (!titleEn || sentArticles.has(key)) continue;

      const pubDate = entry.isoDate ? new Date(entry.isoDate).getTime() : null;
      if (pubDate && now - pubDate > MAX_ARTICLE_AGE_MS) {
        sentArticles.add(key);
        continue;
      }

      const cleanDesc = descEn
        .replace(/\s*This article was written by .+?\./gi, "")
        .replace(/\s*Read more at .+?\./gi, "")
        .trim();

      const fullText = `${titleEn} ${cleanDesc}`.toLowerCase();

      if (STOCK_BLACKLIST.some((kw) => fullText.includes(kw))) continue;

      if (strict) {
        if (!VIP_KEYWORDS.some((kw) => fullText.includes(kw))) continue;
      } else {
        if (!GOOD_KEYWORDS.some((kw) => fullText.includes(kw))) continue;
      }

      sentArticles.add(key);

      const shortDesc = cleanDesc.length > 300 ? cleanDesc.slice(0, 300) + "…" : cleanDesc;

      const [titleRu, descRu] = await Promise.all([
        translateToRussian(titleEn),
        translateToRussian(shortDesc),
      ]);

      const vip       = isVip(fullText);
      const header    = vip ? "🔴 *News Craig Breaking*" : "⚡️ *News Craig Macro*";
      const descBlock = descRu ? `📝 ${descRu}\n\n` : "";

      const message = (
        `${header}\n\n` +
        `📌 *${titleRu}*\n\n` +
        `${descBlock}` +
        `🔗 [Источник](${link})`
      ).slice(0, 4096);

      await sendTelegram(message);

      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}] ${titleEn}`);

      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error(`[Feed] Error (${feedUrl}):`, err.message);
  }
}

async function checkAllFeeds() {
  for (const feed of FEEDS) await checkFeed(feed.url, feed.strict ?? false);
}

// ─── Calendar reminders ───────────────────────────────────────────────────────

async function checkCalendarReminders() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = await res.json();
    const now = Date.now();

    for (const event of events) {
      if (event.impact !== "High") continue;
      const minutesUntil = (new Date(event.date).getTime() - now) / 60_000;
      if (minutesUntil < 14 || minutesUntil > 16) continue;

      const key = `${event.title}|${event.date}`;
      if (sentReminders.has(key)) continue;
      sentReminders.add(key);

      const flag    = CURRENCY_FLAG[event.country] ?? "🌐";
      const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
      });
      const titleRu = await translateToRussian(event.title);

      await sendTelegram(
        `⏰ *ЧЕРЕЗ 15 МИНУТ | ВЫСОКИЙ ПРИОРИТЕТ*\n\n` +
        `${flag} *${titleRu}*\n🇬🇧 _${event.title}_\n\n` +
        `${event.forecast ? `📊 Прогноз: *${event.forecast}*\n` : ""}` +
        `${event.previous ? `📉 Пред. значение: ${event.previous}\n` : ""}` +
        `🕐 Время выхода: *${timeStr} МСК*`
      );
      console.log(`[${new Date().toISOString()}] [REMINDER] ${event.title}`);
    }
  } catch (err) {
    console.error("[Calendar] Error:", err.message);
  }
}

// ─── Weekly digest ────────────────────────────────────────────────────────────

async function sendWeeklyDigest() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events    = await res.json();
    const highEvents = events.filter((e) => e.impact === "High");

    if (highEvents.length === 0) {
      await sendTelegram("📅 *ДАЙДЖЕСТ НА НЕДЕЛЮ*\n\nНа этой неделе событий высокого приоритета не запланировано.");
      return;
    }

    const byDay = new Map();
    for (const event of highEvents) {
      const dayKey = new Date(event.date).toLocaleDateString("ru-RU", {
        weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow",
      });
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(event);
    }

    let body = "";
    for (const [day, dayEvents] of byDay) {
      body += `\n📆 *${day.charAt(0).toUpperCase() + day.slice(1)}*\n`;
      for (const event of dayEvents) {
        const flag    = CURRENCY_FLAG[event.country] ?? "🌐";
        const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
          hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
        });
        const titleRu = await translateToRussian(event.title);
        const fc = event.forecast ? ` · Прогноз: ${event.forecast}` : "";
        const pr = event.previous ? ` · Пред: ${event.previous}` : "";
        body += `  ${flag} ${timeStr} МСК — *${titleRu}*${fc}${pr}\n`;
      }
    }

    await sendTelegram((`📅 *ДАЙДЖЕСТ ВЫСОКОГО ПРИОРИТЕТА НА НЕДЕЛЮ*\n${body}`).slice(0, 4000));
    console.log(`[DIGEST] Weekly digest sent.`);
  } catch (err) {
    console.error("[Digest] Weekly error:", err.message);
  }
}

async function checkWeeklyDigest() {
  if (moscowDayOfWeek() !== 1 || moscowHour() !== 8) return;
  const key = currentMoscowWeekKey();
  if (digestSentForWeek === key) return;
  digestSentForWeek = key;
  await sendWeeklyDigest();
}

// ─── Daily digest ─────────────────────────────────────────────────────────────

async function sendDailyDigest() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events   = await res.json();
    const todayKey = currentMoscowDateKey();

    const todayHigh = events.filter((e) => {
      if (e.impact !== "High") return false;
      return new Date(e.date).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }) === todayKey;
    });

    if (todayHigh.length === 0) {
      await sendTelegram("🌅 *СВОДКА НА СЕГОДНЯ*\n\nСегодня событий высокого приоритета не запланировано.");
      return;
    }

    const dateLabel = new Date().toLocaleDateString("ru-RU", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow",
    });
    let body = "";
    for (const event of todayHigh) {
      const flag    = CURRENCY_FLAG[event.country] ?? "🌐";
      const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
      });
      const titleRu = await translateToRussian(event.title);
      const fc = event.forecast ? ` · Прогноз: *${event.forecast}*` : "";
      const pr = event.previous ? ` · Пред: ${event.previous}` : "";
      body += `\n${flag} *${timeStr} МСК* — ${titleRu}${fc}${pr}`;
    }

    const label = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    await sendTelegram((`🌅 *СВОДКА НА СЕГОДНЯ | ${label}*\n📌 Высокоприоритетные события:\n${body}`).slice(0, 4000));
    console.log(`[DAILY] Daily digest sent.`);
  } catch (err) {
    console.error("[Daily] Error:", err.message);
  }
}

async function checkDailyDigest() {
  if (moscowHour() !== 7) return;
  const key = currentMoscowDateKey();
  if (dailyDigestSentForDay === key) return;
  dailyDigestSentForDay = key;
  await sendDailyDigest();
}

// ─── Truth Social (Trump) ─────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveTrumpAccountId() {
  if (trumpAccountId) return trumpAccountId;
  try {
    const res = await fetch(TRUTH_ACCOUNT_LOOKUP, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    trumpAccountId = data.id;
    console.log(`[Truth] Trump account ID resolved: ${trumpAccountId}`);
    return trumpAccountId;
  } catch (err) {
    console.error("[Truth] Failed to resolve account ID:", err.message);
    return null;
  }
}

async function checkTrumpTruthSocial() {
  try {
    const accountId = await resolveTrumpAccountId();
    if (!accountId) return;

    const url = `https://truthsocial.com/api/v1/accounts/${accountId}/statuses?limit=10&exclude_replies=true&exclude_reblogs=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return;

    const posts = await res.json();
    const now = Date.now();

    for (const post of posts) {
      if (sentTruths.has(post.id)) continue;

      const pubDate = post.created_at ? new Date(post.created_at).getTime() : null;
      if (pubDate && now - pubDate > TRUTH_MAX_AGE_MS) {
        sentTruths.add(post.id);
        continue;
      }

      sentTruths.add(post.id);

      const rawText = post.reblog
        ? post.reblog.content ?? ""
        : post.content ?? "";
      const textEn = stripHtml(rawText);
      if (!textEn) continue;

      const short  = textEn.length > 800 ? textEn.slice(0, 800) + "…" : textEn;
      const textRu = await translateToRussian(short);

      const isReblog  = !!post.reblog;
      const postUrl   = post.reblog ? post.reblog.url : post.url;
      const reblogBy  = isReblog ? "🔁 _Репост Трампа_\n\n" : "";

      const message = (
        `🇺🇸 *ТРАМП | Truth Social*\n\n` +
        `${reblogBy}` +
        `📝 ${textRu}\n\n` +
        `🔗 [Открыть пост](${postUrl ?? "https://truthsocial.com/@realDonaldTrump"})`
      ).slice(0, 4096);

      await sendTelegram(message);
      console.log(`[${new Date().toISOString()}] [TRUMP] ${textEn.slice(0, 80)}…`);

      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error("[Truth] Error:", err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_TOKEN and TELEGRAM_CHAT_ID must be set.");
    process.exit(1);
  }

  console.log("🚀 News Craig v3 started.");
  await sendTelegram(
    "🚀 *News Craig v3 запущен!*\n\n" +
    "🔴 Срочные новости — приоритетный формат\n" +
    "⚡️ Обычные макро-новости — стандартный формат\n" +
    "🌐 Перевод через LibreTranslate (debug mode)\n"
    "⏰ Напоминания за 15 минут до выхода данных\n" +
    "📰 Источники: Yahoo Finance, ForexLive\n" +
    "🇺🇸 Посты Трампа: Truth Social (каждые 30 сек)"
  );

  await checkAllFeeds();
  await checkCalendarReminders();
  await checkTrumpTruthSocial();

  setInterval(checkAllFeeds,           POLL_INTERVAL_MS);
  setInterval(checkTrumpTruthSocial,   TRUTH_POLL_INTERVAL_MS);
  setInterval(checkCalendarReminders,  CALENDAR_INTERVAL_MS);
  setInterval(checkWeeklyDigest,       CALENDAR_INTERVAL_MS);
  setInterval(checkDailyDigest,        CALENDAR_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
