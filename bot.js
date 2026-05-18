import RSSParser from "rss-parser";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const POLL_INTERVAL_MS = 15_000;
const CALENDAR_INTERVAL_MS = 60_000;
const PRICE_INTERVAL_MS = 5 * 60_000; // every 5 min
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

// ─── Constants ────────────────────────────────────────────────────────────────

const FEEDS: { url: string }[] = [
  { url: "https://investinglive.com/feed/news/" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
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

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", All: "🌐",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const sentArticles = new Set<string>();
const MAX_ARTICLE_AGE_MS = 20 * 60_000; // ignore articles older than 20 min
const MSG_SEND_DELAY_MS = 5_000;        // pause between consecutive messages
const sentReminders = new Set<string>();
const sentSessionAlerts = new Set<string>();
let digestSentForWeek = "";
let dailyDigestSentForDay = "";

const parser = new RSSParser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVip(text: string): boolean {
  return VIP_KEYWORDS.some((kw) => text.includes(kw));
}

function getLocalHHMM(tz: string): { hour: number; minute: number } {
  const s = new Date().toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = s.replace("24:", "00:").split(":").map(Number);
  return { hour: h, minute: m };
}

function moscowHour(): number {
  return getLocalHHMM("Europe/Moscow").hour;
}

function currentMoscowDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}

function currentMoscowWeekKey(): string {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  );
  const year = now.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = Math.ceil(
    ((now.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7
  );
  return `${year}-W${week}`;
}

function moscowDayOfWeek(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  ).getDay();
}

async function translateToRussian(text: string): Promise<string> {
  if (!text) return "";
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return text;
    const data = (await res.json()) as unknown[][];
    const segments = data[0] as unknown[][];
    return segments.map((s) => (s as unknown[])[0]).join("");
  } catch {
    return text;
  }
}

async function sendToChat(chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
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

async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
  // Send to personal chat and channel simultaneously
  await Promise.all([
    sendToChat(TELEGRAM_CHAT_ID, text),
    sendToChat(TELEGRAM_CHANNEL, text),
  ]);
}

// ─── News feed polling ────────────────────────────────────────────────────────

async function checkFeed(feedUrl: string): Promise<void> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const now = Date.now();

    for (const entry of feed.items.slice(0, 10)) {
      const titleEn = entry.title ?? "";
      const descEn = entry.contentSnippet ?? entry.content ?? entry.summary ?? "";
      const link = entry.link ?? "";

      if (!titleEn || sentArticles.has(titleEn)) continue;

      // Skip articles older than 20 minutes — prevents re-sending old news on restart
      const pubDate = entry.isoDate ? new Date(entry.isoDate).getTime() : null;
      if (pubDate && now - pubDate > MAX_ARTICLE_AGE_MS) {
        sentArticles.add(titleEn); // mark as seen so it doesn't get checked again
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

      const vip = isVip(fullText);
      const header = vip ? "🔴 *News Craig Breaking*" : "⚡️ *News Craig Macro*";
      const descBlock = descRu ? `📝 ${descRu}\n\n` : "";
      const message = (
        `${header}\n\n📌 *${titleRu}*\n${descBlock}` +
        `🇬🇧 _Оригинал:_\n_${shortTitleEn}_\n\n🔗 [Источник](${link})`
      ).slice(0, 4000);

      await sendTelegram(message);
      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}] ${titleEn}`);

      // Pause between messages so they don't flood the chat all at once
      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error(`Feed error (${feedUrl}):`, err);
  }
}

async function checkAllFeeds(): Promise<void> {
  for (const feed of FEEDS) await checkFeed(feed.url);
}

// ─── Calendar reminders ───────────────────────────────────────────────────────

async function checkCalendarReminders(): Promise<void> {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = (await res.json()) as CalendarEvent[];
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

// ─── Price alerts ─────────────────────────────────────────────────────────────

interface PriceAsset {
  symbol: string;     // Yahoo Finance ticker
  label: string;      // Display name
  emoji: string;
  unit: string;       // "$", "pts"
  // Key levels: price → alerted flag. Reset when price moves 1.5% away.
  levels: { price: number; direction: "above" | "below"; alerted: boolean }[];
}

const PRICE_ASSETS: PriceAsset[] = [
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

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart: { result: { meta: { regularMarketPrice: number } }[] };
    };
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// Silent init — marks already-crossed levels on startup so we don't spam
async function initPriceLevels(): Promise<void> {
  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;
    for (const level of asset.levels) {
      const crossed =
        level.direction === "above" ? price >= level.price : price <= level.price;
      if (crossed) level.alerted = true;
    }
    console.log(`[PRICE INIT] ${asset.label}: ${price.toFixed(2)} ${asset.unit}`);
  }
}

async function checkPriceAlerts(): Promise<void> {
  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;

    for (const level of asset.levels) {
      const crossed =
        level.direction === "above" ? price >= level.price : price <= level.price;
      const resetBuffer = level.price * 0.015; // 1.5% buffer before re-arming
      const reversed =
        level.direction === "above"
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
        console.log(
          `[${new Date().toISOString()}] [PRICE] ${asset.label} ${sign} ${level.price} @ ${price.toFixed(2)}`
        );
      }
    }
  }
}

// ─── Session open alerts ──────────────────────────────────────────────────────

interface TradingSession {
  name: string;
  emoji: string;
  timezone: string;    // IANA timezone of the exchange
  openHour: number;    // Local open time
  openMinute: number;
  warnMinutes: number; // Alert this many minutes before open
}

const SESSIONS: TradingSession[] = [
  { name: "Сиднейская сессия",  emoji: "🇦🇺", timezone: "Australia/Sydney",    openHour: 10, openMinute: 0,  warnMinutes: 5 },
  { name: "Токийская сессия",   emoji: "🇯🇵", timezone: "Asia/Tokyo",          openHour: 9,  openMinute: 0,  warnMinutes: 5 },
  { name: "Лондонская сессия",  emoji: "🇬🇧", timezone: "Europe/London",       openHour: 8,  openMinute: 0,  warnMinutes: 5 },
  { name: "Нью-Йоркская сессия",emoji: "🇺🇸", timezone: "America/New_York",    openHour: 9,  openMinute: 30, warnMinutes: 5 },
];

function sessionWarnHHMM(session: TradingSession): { hour: number; minute: number } {
  const totalMin = session.openHour * 60 + session.openMinute - session.warnMinutes;
  const h = Math.floor(((totalMin % 1440) + 1440) % 1440 / 60);
  const m = ((totalMin % 60) + 60) % 60;
  return { hour: h, minute: m };
}

function sessionOpenTimeMoscow(session: TradingSession): string {
  // Build a Date for today's session open in the session's own timezone,
  // then display it in Moscow time. This automatically handles DST.
  const nowInSessionTz = new Date().toLocaleDateString("en-CA", {
    timeZone: session.timezone,
  });
  const isoStr = `${nowInSessionTz}T${String(session.openHour).padStart(2, "0")}:${String(session.openMinute).padStart(2, "0")}:00`;
  // Create a "fake" date using local parsing — instead use UTC offset approach
  // We calculate by finding the UTC time that corresponds to openHour:openMinute in session.timezone
  const probe = new Date();
  // Get current hour/minute in session timezone
  const { hour: curH, minute: curM } = getLocalHHMM(session.timezone);
  const curTotalMin = curH * 60 + curM;
  const openTotalMin = session.openHour * 60 + session.openMinute;
  const diffMs = (openTotalMin - curTotalMin) * 60_000;
  const openUtcMs = probe.getTime() + diffMs;
  return new Date(openUtcMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
}

async function checkSessionAlerts(): Promise<void> {
  const nowDateKey = currentMoscowDateKey();

  for (const session of SESSIONS) {
    const warn = sessionWarnHHMM(session);
    const { hour, minute } = getLocalHHMM(session.timezone);

    if (hour !== warn.hour || minute !== warn.minute) continue;

    // Only fire in the first 45 seconds of the warning minute.
    // If the bot restarted mid-minute, the Set is empty but this guard blocks re-sending.
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
    console.log(
      `[${new Date().toISOString()}] [SESSION] ${session.name} opens in ${session.warnMinutes} min`
    );
  }
}

// ─── Weekly digest ───────────────────────────────────────────────────────────

async function sendWeeklyDigest(): Promise<void> {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = (await res.json()) as CalendarEvent[];
    const highEvents = events.filter((e) => e.impact === "High");

    if (highEvents.length === 0) {
      await sendTelegram("📅 *ДАЙДЖЕСТ НА НЕДЕЛЮ*\n\nНа этой неделе событий высокого приоритета не запланировано.");
      return;
    }

    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of highEvents) {
      const dayKey = new Date(event.date).toLocaleDateString("ru-RU", {
        weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow",
      });
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey)!.push(event);
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

async function checkWeeklyDigest(): Promise<void> {
  if (moscowDayOfWeek() !== 1 || moscowHour() !== 8) return;
  const key = currentMoscowWeekKey();
  if (digestSentForWeek === key) return;
  digestSentForWeek = key;
  await sendWeeklyDigest();
}

// ─── Daily digest ─────────────────────────────────────────────────────────────

async function sendDailyDigest(): Promise<void> {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return;
    const events = (await res.json()) as CalendarEvent[];
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

async function checkDailyDigest(): Promise<void> {
  if (moscowHour() !== 7) return;
  const key = currentMoscowDateKey();
  if (dailyDigestSentForDay === key) return;
  dailyDigestSentForDay = key;
  await sendDailyDigest();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
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
  await initPriceLevels(); // silent init — no spam on startup

  setInterval(checkAllFeeds, POLL_INTERVAL_MS);
  setInterval(checkCalendarReminders, CALENDAR_INTERVAL_MS);
  setInterval(checkSessionAlerts, CALENDAR_INTERVAL_MS);
  setInterval(checkWeeklyDigest, CALENDAR_INTERVAL_MS);
  setInterval(checkDailyDigest, CALENDAR_INTERVAL_MS);
  setInterval(checkPriceAlerts, PRICE_INTERVAL_MS);
}

main();
