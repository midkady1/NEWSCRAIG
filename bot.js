import 'dotenv/config';
import RSSParser from "rss-parser";

// Пропишите ваши данные прямо сюда в кавычках, чтобы избежать ошибки 401:
const TELEGRAM_TOKEN = "ВАШ_ТОКЕН_ОТ_BOTFATHER";
const TELEGRAM_CHAT_ID = "ВАШ_ЧАТ_АЙДИ";
const TELEGRAM_CHANNEL = "@newscraig";

const POLL_INTERVAL_MS = 15_000;
const CALENDAR_INTERVAL_MS = 60_000;
const PRICE_INTERVAL_MS = 5 * 60_000;
const CALENDAR_URL = "https://faireconomy.media";

const FEEDS = [
  { url: "https://investinglive.com" },
  { url: "https://marketwatch.com" },
];

const GOOD_KEYWORDS = [
  "trump", "warsh", "tariffs", "sanctions", "trade war", "white house",
  "president", "deportations",
  "oil", "opec", "opec+", "wti", "brent", "crude", "eia", "api", "energy",
  "spr", "mideast", "red sea",
  "gold", "silver", "xau", "xag", "palladium", "platinum", "bullion",
  "metals", "safe haven",
  "fed", "fomc", "waller", "rate", "ecb", "lagarde", "boe", "bailey",
  "boj", "rba", "interest", "hawk", "dove", "hikes", "cuts",
  "nfp", "nonfarm", "unemployment", "jobs", "cpi", "pce", "inflation",
  "gdp", "pmi", "retail", "treasury", "yields",
  "dollar", "usd", "eur", "gbp", "jpy", "aud", "cad", "chf", "currency",
  "forex", "intervention",
];

const VIP_KEYWORDS = [
  "fomc", "rate decision", "rate hike", "rate cut", "emergency",
  "nfp", "nonfarm payroll", "cpi", "inflation report",
  "powell", "lagarde", "warsh",
  "oil spike", "oil crash", "opec emergency", "opec+ emergency",
  "intervention", "default", "recession", "bank run", "collapse",
  "war", "attack", "nuclear", "missile", "explosion",
  "breaking", "flash", "urgent", "alert",
];

const STOCK_BLACKLIST = [
  "shares", "stock", "earnings", "revenue", "quarterly", "profit",
  "dividend", "ceo", "acquisition", "merger", "nasdaq", "s&p 500",
  "dow jones", "q1", "q2", "q3", "q4", "nyse", "ipo", "buyback",
];

const CURRENCY_FLAG = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", All: "🌐",
};

// ─── Краткий словарь триггеров влияния макроструктур на активы ───────────────
const IMPACT_DICTIONARY = [
  {
    keywords: [["china", "китай", "pmi"], ["weak", "slow", "fall", "drop", "bad", "слаб", "упал", "плох", "снижен"]],
    impact: "📉 Плохо для Китая — медь и нефть под давлением, USD растет."
  },
  {
    keywords: [["china", "китай"], ["stimulus", "growth", "rise", "good", "стимул", "рост", "поддерж"]],
    impact: "📈 Позитив для Китая — медь, нефть и AUD в рост."
  },
  {
    keywords: [["fed", "fomc", "powell", "фрс", "пауэлл"], ["hike", "hawk", "tighten", "повыш", "ястреб"]],
    impact: "🦅 Ястребиный ФРС — доллар (USD) вверх, золото и акции вниз."
  },
  {
    keywords: [["fed", "fomc", "powell", "фрс", "пауэлл"], ["cut", "dove", "ease", "снижен", "голуб"]],
    impact: "🕊 Голубиный ФРС — доллар (USD) вниз, золото, крипта и акции вверх."
  },
  {
    keywords: [["oil", "opec", "crude", "нефть", "опек"], ["cut", "escalation", "war", "сокращ", "война"]],
    impact: "🚀 Дефицит / Риски — нефть (Brent/WTI) и сырьевой CAD вверх."
  },
  {
    keywords: [["war", "attack", "nuclear", "missile", "война", "атака", "ракета", "конфликт"]],
    impact: "🛡 Геополитика (Risk-Off) — защитные активы (золото, USD, JPY, CHF) в рост."
  },
  {
    keywords: [["cpi", "inflation", "pce", "инфляция"], ["high", "rise", "hot", "высок", "рост", "ускор"]],
    impact: "🔥 Рост инфляции — доходность трежерис и доллар (USD) вверх, золото вниз."
  },
  {
    keywords: [["cpi", "inflation", "pce", "инфляция"], ["low", "cool", "fall", "низк", "замедл", "упал"]],
    impact: "❄ Снижение инфляции — доллар (USD) вниз, сильный импульс для золота."
  }
];

const sentArticles = new Set();
const MAX_ARTICLE_AGE_MS = 20 * 60_000;
const MSG_SEND_DELAY_MS = 5_000;
const sentReminders = new Set();
const sentSessionAlerts = new Set();
let digestSentForWeek = "";
let dailyDigestSentForDay = "";

const parser = new RSSParser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

function isVip(text) {
  return VIP_KEYWORDS.some((kw) => text.includes(kw));
}

function analyzeImpact(textText) {
  const lowerText = textText.toLowerCase();
  for (const item of IMPACT_DICTIONARY) {
    const matchesAllGroups = item.keywords.every(group => 
      group.some(kw => lowerText.includes(kw))
    );
    if (matchesAllGroups) {
      return `\n💡 *Влияние:* ${item.impact}\n\n`;
    }
  }
  return "";
}

// ВОЗВРАЩАЕМ ВАШИ ОРИГИНАЛЬНЫЕ ФУНКЦИИ ВРЕМЕНИ БЕЗ ИЗМЕНЕНИЙ:
function getLocalHHMM(tz) {
  const s = new Date().toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = s.replace("24:", "00:").split(":").map(Number);
  return { hour: h, minute: m };
}

function moscowHour() {
  return getLocalHHMM("Europe/Moscow").hour;
}

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

async function translateToRussian(text) {
  if (!text) return "";
  try {
    const url = `https://googleapis.com{encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return text;
    const data = await res.json();
    return data[0].map((s) => s[0]).join("");
  } catch {
    return text;
  }
}

async function sendToChat(chatId, text) {
  const url = `https://telegram.org{TELEGRAM_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram error (${chatId}) ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(`Failed to send to ${chatId}:`, err);
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  await Promise.all([
    sendToChat(TELEGRAM_CHAT_ID, text),
    sendToChat(TELEGRAM_CHANNEL, text),
  ]);
}

async function checkFeed(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const now = Date.now();

    for (const entry of feed.items.slice(0, 10)) {
      const titleEn = entry.title ?? "";
      const descEn = entry.contentSnippet ?? entry.content ?? entry.summary ?? "";
      const link = entry.link ?? "";

      if (!titleEn || sentArticles.has(titleEn)) continue;

      const pubDate = entry.isoDate ? new Date(entry.isoDate).getTime() : null;
      if (pubDate && now - pubDate > MAX_ARTICLE_AGE_MS) {
        sentArticles.add(titleEn);
        continue;
      }

      const cleanDesc = descEn
        .replace(/\s*This article was written by .+?\./gi, "")
        .replace(/\s*Read more at .+?\./gi, "")
        .trim();

      const fullText = `${titleEn} ${cleanDesc}`.toLowerCase();
      if (STOCK_BLACKLIST.some((kw) => fullText.includes(kw))) continue;
      if (!GOOD_KEYWORDS.some((kw) => fullText.includes(kw))) continue;

      sentArticles.add(titleEn);

      const shortDesc = cleanDesc.length > 400 ? cleanDesc.slice(0, 400) + "…" : cleanDesc;
      const shortTitleEn = titleEn.length > 200 ? titleEn.slice(0, 200) + "…" : titleEn;

      const [titleRu, descRu] = await Promise.all([
        translateToRussian(titleEn),
        translateToRussian(shortDesc),
      ]);

      const impactBlock = analyzeImpact(`${fullText} ${titleRu} ${descRu}`);
      const vip = isVip(fullText);
      const header = vip ? "🔴 *News Craig Breaking*" : "⚡️ *News Craig Macro*";
      const descBlock = descRu ? `📝 ${descRu}\n\n` : "";
      const message = (
        `${header}\n\n📌 *${titleRu}*\n${descBlock}${impactBlock}` +
        `🇬🇧 _Оригинал:_\n_${shortTitleEn}_\n\n🔗 [Источник](${link})`
      ).slice(0, 4000);

      await sendTelegram(message);
      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}] ${titleEn}`);

      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error(`Feed error (${feedUrl}):`, err);
  }
}

// Защищенный вызов лент, чтобы кривой XML-код сайтов не крашил приложение:
async function checkAllFeeds() {
  for (const feed of FEEDS) {
    try {
      await checkFeed(feed.url);
    } catch (e) {
      console.error(`[FEED ERROR] Сбой парсинга ${feed.url}:`, e.message);
    }
  }
}

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

      const flag = CURRENCY_FLAG[event.country] ?? "🌐";
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
    console.error("Calendar error:", err);
  }
}

const PRICE_ASSETS = [
  {
    symbol: "GC=F", label: "Золото (XAU/USD)", emoji: "🥇", unit: "$",
    levels: [
      { price: 4400, direction: "below", alerted: false },
      { price: 4500, direction: "below", alerted: false },
      { price: 4600, direction: "above", alerted: false },
      { price: 4700, direction: "above", alerted: false },
      { price: 4800, direction: "above", alerted: false },
      { price: 5000, direction: "above", alerted: false },
    ],
  },
  {
    symbol: "CL=F", label: "Нефть WTI", emoji: "🛢️", unit: "$",
    levels: [
      { price: 55, direction: "below", alerted: false },
      { price: 60, direction: "below", alerted: false },
      { price: 70, direction: "above", alerted: false },
      { price: 80, direction: "above", alerted: false },
      { price: 90, direction: "above", alerted: false },
      { price: 100, direction: "above", alerted: false },
    ],
  },
  {
    symbol: "BZ=F", label: "Нефть Brent", emoji: "⛽", unit: "$",
    levels: [
      { price: 60, direction: "below", alerted: false },
      { price: 65, direction: "below", alerted: false },
      { price: 75, direction: "above", alerted: false },
      { price: 85, direction: "above", alerted: false },
      { price: 95, direction: "above", alerted: false },
      { price: 105, direction: "above", alerted: false },
    ],
  },
  {
    symbol: "DX-Y.NYB", label: "Индекс доллара (DXY)", emoji: "💵", unit: "pts",
    levels: [
      { price: 98, direction: "below", alerted: false },
      { price: 100, direction: "below", alerted: false },
      { price: 105, direction: "above", alerted: false },
      { price: 108, direction: "above", alerted: false },
      { price: 110, direction: "above", alerted: false },
    ],
  },
];

// Полностью безопасная функция чтения цен без использования символов ?.
async function fetchPrice(symbol) {
  try {
    const url = `https://yahoo.com{encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta) {
      return data.chart.result[0].meta.regularMarketPrice ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function initPriceLevels() {
  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;
    for (const level of asset.levels) {
      const crossed = level.direction === "above" ? price >= level.price : price <= level.price;
      if (crossed) level.alerted = true;
    }
    console.log(`[PRICE INIT] ${asset.label}: ${price.toFixed(2)} ${asset.unit}`);
  }
}

async function checkPriceAlerts() {
  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;

    for (const level of asset.levels) {
      const crossed = level.direction === "above" ? price >= level.price : price <= level.price;
      const resetBuffer = level.price * 0.015;
      const reversed = level.direction === "above"
        ? price < level.price - resetBuffer
        : price > level.price + resetBuffer;

      if (level.alerted && reversed) {
        level.alerted = false;
        continue;
      }

      if (!level.alerted && crossed) {
        level.alerted = true;
        const arrow = level.direction === "above" ? "📈" : "📉";
        const sign = level.direction === "above" ? "выше" : "ниже";
        await sendTelegram(
          `${arrow} *ЦЕНОВОЙ АЛЕРТ*\n\n` +
          `${asset.emoji} *${asset.label}*\n` +
          `Цена *${sign} ${level.price} ${asset.unit}*\n` +
          `Текущая цена: *${price.toFixed(2)} ${asset.unit}*`
        );
        console.log(`[${new Date().toISOString()}] [PRICE] ${asset.label} ${sign} ${level.price} @ ${price.toFixed(2)}`);
      }
    }
  }
}

const SESSIONS = [
  { name: "Сиднейская сессия",   emoji: "🇦🇺", timezone: "Australia/Sydney",  openHour: 10, openMinute: 0,  warnMinutes: 5 },
  { name: "Токийская сессия",    emoji: "🇯🇵", timezone: "Asia/Tokyo",         openHour: 9,  openMinute: 0,  warnMinutes: 5 },
  { name: "Лондонская сессия",   emoji: "🇬🇧", timezone: "Europe/London",      openHour: 8,  openMinute: 0,  warnMinutes: 5 },
  { name: "Нью-Йоркская сессия", emoji: "🇺🇸", timezone: "America/New_York",   openHour: 9,  openMinute: 30, warnMinutes: 5 },
];

function sessionWarnHHMM(session) {
  const totalMin = session.openHour * 60 + session.openMinute - session.warnMinutes;
  const h = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const m = ((totalMin % 60) + 60) % 60;
  return { hour: h, minute: m };
}

function sessionOpenTimeMoscow(session) {
  const probe = new Date();
  const { hour: curH, minute: curM } = getLocalHHMM(session.timezone);
  const curTotalMin = curH * 60 + curM;
  const openTotalMin = session.openHour * 60 + session.openMinute;
  const diffMs = (openTotalMin - curTotalMin) * 60_000;
  const openUtcMs = probe.getTime() + diffMs;
  return new Date(openUtcMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
}

async function checkSessionAlerts() {
  const nowDateKey = currentMoscowDateKey();

  for (const session of SESSIONS) {
    const warn = sessionWarnHHMM(session);
    const { hour, minute } = getLocalHHMM(session.timezone);

    if (hour !== warn.hour || minute !== warn.minute) continue;
    if (new Date().getSeconds() >= 45) continue;

    const alertKey = `${session.name}|${nowDateKey}`;
    if (sentSessionAlerts.has(alertKey)) continue;
    sentSessionAlerts.add(alertKey);

    const openTimeMsk = sessionOpenTimeMoscow(session);
    const openTimeLocal = `${String(session.openHour).padStart(2, "0")}:${String(session.openMinute).padStart(2, "0")}`;

    await sendTelegram(
      `🔔 *ОТКРЫТИЕ СЕССИИ ЧЕРЕЗ ${session.warnMinutes} МИНУТ*\n\n` +
      `${session.emoji} *${session.name}*\n` +
      `🕐 Открытие: *${openTimeMsk} МСК* (${openTimeLocal} местного времени)\n` +
      `📍 _Время учитывает летнее/зимнее время автоматически_`
    );
    console.log(`[${new Date().toISOString()}] [SESSION] ${session.name} opens in ${session.warnMinutes} min`);
  }
}

async function sendWeeklyDigest() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = await res.json();
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
        const flag = CURRENCY_FLAG[event.country] ?? "🌐";
        const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
          hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
        });
        const fc = event.forecast ? ` · Прогноз: ${event.forecast}` : "";
        const pr = event.previous ? ` · Пред: ${event.previous}` : "";
        body += `  ${flag} ${timeStr} МСК — *${event.title}*${fc}${pr}\n`;
      }
    }

    await sendTelegram((`📅 *ДАЙДЖЕСТ ВЫСОКОГО ПРИОРИТЕТА НА НЕДЕЛЮ*\n${body}`).slice(0, 4000));
    console.log(`[${new Date().toISOString()}] [DIGEST] Weekly digest sent.`);
  } catch (err) {
    console.error("Weekly digest error:", err);
  }
}

async function checkWeeklyDigest() {
  if (moscowDayOfWeek() !== 1 || moscowHour() !== 8) return;
  const key = currentMoscowWeekKey();
  if (digestSentForWeek === key) return;
  digestSentForWeek = key;
  await sendWeeklyDigest();
}

async function sendDailyDigest() {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = await res.json();
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
      const flag = CURRENCY_FLAG[event.country] ?? "🌐";
      const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
      });
      const fc = event.forecast ? ` · Прогноз: *${event.forecast}*` : "";
      const pr = event.previous ? ` · Пред: ${event.previous}` : "";
      body += `\n${flag} *${timeStr} МСК* — ${event.title}${fc}${pr}`;
    }

    const label = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
    await sendTelegram((`🌅 *СВОДКА НА СЕГОДНЯ | ${label}*\n📌 Высокоприоритетные события:\n${body}`).slice(0, 4000));
    console.log(`[${new Date().toISOString()}] [DAILY] Daily digest sent.`);
  } catch (err) {
    console.error("Daily digest error:", err);
  }
}

async function checkDailyDigest() {
  if (moscowHour() !== 7) return;
  const key = currentMoscowDateKey();
  if (dailyDigestSentForDay === key) return;
  dailyDigestSentForDay = key;
  await sendDailyDigest();
}

// ВОЗВРАЩАЕМ ВАШ КЛАССИЧЕСКИЙ МЕТОД MAIN С ПРИВЕТСТВИЕМ:
async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_TOKEN and TELEGRAM_CHAT_ID must be set.");
    process.exit(1);
  }

  console.log("🚀 News Craig started.");
  await sendTelegram(
    "🚀 *News Craig запущен!*\n\n" +
    "🔴 Срочные новости — приоритетный формат\n" +
    "⚡️ Обычные макро-новости — стандартный формат\n" +
    "⏰ Напоминания за 15 минут до выхода данных\n" +
    "📈 Ценовые алерты: Золото, WTI, Brent, DXY\n" +
    "🔔 Открытие торговых сессий (с учётом летнего времени)"
  );

  await checkAllFeeds();
  await checkCalendarReminders();
  await initPriceLevels();

  setInterval(checkAllFeeds, POLL_INTERVAL_MS);
  setInterval(checkCalendarReminders, CALENDAR_INTERVAL_MS);
  setInterval(checkSessionAlerts, CALENDAR_INTERVAL_MS);
  setInterval(checkWeeklyDigest, CALENDAR_INTERVAL_MS);
  setInterval(checkDailyDigest, CALENDAR_INTERVAL_MS);
  setInterval(checkPriceAlerts, PRICE_INTERVAL_MS);
}

main();
