import RSSParser from "rss-parser";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const POLL_INTERVAL_MS = 30_000;
const CALENDAR_INTERVAL_MS = 60_000;
const PRICE_INTERVAL_MS = 5 * 60_000;
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

// strict:true — пропускать только если есть VIP-слово (для широких нефинансовых источников)
const FEEDS = [
  // Финансовые — стандартный фильтр
  { url: "https://investinglive.com/feed/news/" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { url: "https://feeds.reuters.com/reuters/businessNews" },
  { url: "https://www.forexlive.com/feed/news" },
  // Трамп / Белый дом — строгий фильтр
  { url: "https://truthsocial.com/@realDonaldTrump.rss", strict: true },
  { url: "https://www.whitehouse.gov/feed/", strict: true },
  { url: "https://feeds.apnews.com/rss/politics", strict: true },
  // Геополитика — строгий фильтр (только экстренное)
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", strict: true },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml", strict: true },
];

const GOOD_KEYWORDS = [
  // Трамп / политика США (только рыночно значимые)
  "trump", "warsh", "tariffs", "sanctions", "trade war", "white house",
  "executive order", "tariff exemption", "tariff pause",
  "trade deal", "trade agreement", "scott bessent", "g7", "g20",
  // Энергетика
  "oil", "opec", "opec+", "wti", "brent", "crude", "eia", "energy",
  "spr", "mideast", "red sea", "iran", "iraq", "saudi", "natural gas", "lng",
  // Драгметаллы / сырьё
  "gold", "silver", "xau", "xag", "palladium", "platinum", "bullion",
  "safe haven", "copper", "aluminum",
  // Центробанки / монетарная политика
  "fed", "fomc", "waller", "federal reserve", "rate decision",
  "ecb", "lagarde", "boe", "bailey", "boj", "rba", "rate hike", "rate cut",
  "interest rate", "hawkish", "dovish",
  // Макроданные
  "nfp", "nonfarm", "unemployment", "cpi", "pce", "inflation",
  "gdp", "pmi", "retail sales", "treasury yields",
  // Валюты
  "dollar index", "dxy", "usd", "eur/usd", "gbp/usd", "usd/jpy",
  "forex", "currency intervention", "yen intervention",
  // Геополитика (только рыночная)
  "china pmi", "caixin", "russia sanctions", "ukraine war",
  "war", "conflict", "nuclear", "missile", "attack",
  // Кризис / системные риски
  "default", "recession", "bank run", "collapse", "credit crunch",
  // Крипто (институциональное)
  "bitcoin etf", "btc", "crypto regulation", "sec crypto",
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
  // Трамп / политика
  "trump announces", "trump signs", "executive order", "trump tariff",
  "tariffs on", "tariff hike", "tariff pause", "trade deal signed",
  "trump threatens", "trump warns", "white house announces",
  "trump fires", "trump nominates",
];

const STOCK_BLACKLIST = [
  // Корпоративные новости
  "shares", "stock", "earnings", "revenue", "quarterly", "profit",
  "dividend", "ceo", "cfo", "coo", "acquisition", "merger", "buyback",
  "ipo", "valuation", "market cap", "listed", "delisted", "spinoff",
  "q1", "q2", "q3", "q4", "fiscal year", "annual report", "guidance",
  "beat estimates", "missed estimates", "eps", "per share",
  // Биржи / индексы (акций)
  "nasdaq", "s&p 500", "dow jones", "nyse", "russell 2000",
  "ftse", "dax", "nikkei", "hang seng", "stoxx",
  // Отдельные компании
  "apple", "microsoft", "google", "alphabet", "amazon", "meta",
  "tesla", "nvidia", "berkshire", "jpmorgan", "goldman sachs",
  "exxon", "chevron", "shell", "bp ", "totalenergies",
  "bank of america", "citigroup", "wells fargo",
  // Прочий шум
  "analyst rating", "price target", "upgrade", "downgrade",
  "outperform", "underperform", "buy rating", "sell rating",
  "hedge fund", "portfolio", "etf holdings",
  // Политика без рынка
  "immigration", "border wall", "abortion", "gun control",
  "election campaign", "poll shows", "approval rating",
  "healthcare bill", "education", "climate bill",
];

const CURRENCY_FLAG = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
  CNY: "🇨🇳", All: "🌐",
};

// ─── Analytics Engine ─────────────────────────────────────────────────────────
//
// Each rule:
//   keywords   — слова в тексте новости (lowercase)
//   negKeywords — если присутствуют, правило НЕ срабатывает (избегаем ложных совпадений)
//   impacts     — список затронутых активов
//     asset     — название актива
//     dir       — "↑" рост | "↓" падение | "↑↓" волатильность
//     reason    — краткое объяснение по-русски

const ANALYTICS_RULES = [

  // ── КИТАЙ / АЗИЯ ────────────────────────────────────────────────────────────
  {
    id: "china_weak",
    keywords: ["china", "chinese", "beijing", "caixin"],
    negKeywords: ["strong china", "china beats", "china surpasses"],
    sentimentNeg: ["weak", "miss", "slows", "decline", "falls", "contraction", "below", "disappoints", "cut", "stimulus", "slowdown"],
    impacts: [
      { asset: "🥈 Медь (HG)", dir: "↓", reason: "Китай — ~55% мирового спроса на медь; слабые данные давят на цену" },
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↓", reason: "Снижение промпроизводства → меньший спрос на энергоносители" },
      { asset: "🇦🇺 AUD/USD", dir: "↓", reason: "Австралия экспортирует железную руду и уголь в Китай" },
      { asset: "🇳🇿 NZD/USD", dir: "↓", reason: "NZD коррелирует с риск-аппетитом и китайским спросом" },
    ],
  },
  {
    id: "china_strong",
    keywords: ["china", "chinese", "beijing", "caixin"],
    negKeywords: [],
    sentimentPos: ["strong", "beats", "surges", "grows", "recovery", "above", "stimulus", "expansion", "record"],
    impacts: [
      { asset: "🥈 Медь (HG)", dir: "↑", reason: "Рост промпроизводства Китая → спрос на медь растёт" },
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "Восстановление экономики → рост потребления энергии" },
      { asset: "🇦🇺 AUD/USD", dir: "↑", reason: "Позитив по Китаю поддерживает сырьевые экономики" },
    ],
  },

  // ── ИРАН / БЛИЖНИЙ ВОСТОК ────────────────────────────────────────────────────
  {
    id: "iran_conflict",
    keywords: ["iran", "hormuz", "strait of hormuz", "tehran", "persian gulf"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "~20% мировых поставок нефти идёт через Ормузский пролив" },
      { asset: "🥇 Золото (XAU/USD)", dir: "↑", reason: "Геополитическая напряжённость → спрос на защитные активы" },
      { asset: "💵 DXY (Доллар)", dir: "↑", reason: "Кризисный спрос на доллар как на резервную валюту" },
      { asset: "✈️ Авиация / EM-активы", dir: "↓", reason: "Рост цен на топливо давит на авиаотрасль и EM" },
    ],
  },
  {
    id: "red_sea",
    keywords: ["red sea", "houthi", "suez", "shipping", "tanker"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть (Brent)", dir: "↑", reason: "Перебои в транзите → дефицит предложения" },
      { asset: "📦 Фрахт (товары)", dir: "↑", reason: "Суда вынуждены огибать Африку, логистика дорожает" },
      { asset: "🌾 Пшеница / зерно", dir: "↑", reason: "Цепочки поставок зерна из Чёрного моря под угрозой" },
    ],
  },

  // ── РОССИЯ / УКРАИНА ─────────────────────────────────────────────────────────
  {
    id: "russia_ukraine",
    keywords: ["russia", "ukraine", "kremlin", "moscow", "kyiv", "zelenskyy", "putin"],
    negKeywords: [],
    impacts: [
      { asset: "🌾 Пшеница / зерно", dir: "↑", reason: "РФ и Украина — ключевые экспортёры зерна (>25% мирового рынка)" },
      { asset: "🛢️ Нефть (Urals/Brent)", dir: "↑", reason: "Санкции на российскую нефть сокращают предложение" },
      { asset: "⚡ Природный газ (EU)", dir: "↑", reason: "Европа зависит от транзита российского газа" },
      { asset: "🥇 Золото", dir: "↑", reason: "Геополитический риск → защитные активы" },
      { asset: "🇪🇺 EUR/USD", dir: "↓", reason: "Европейская экономика страдает от энергетического кризиса" },
    ],
  },

  // ── САНКЦИИ ───────────────────────────────────────────────────────────────────
  {
    id: "sanctions",
    keywords: ["sanctions", "embargo", "banned", "blocked", "restricted"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть", dir: "↑", reason: "Санкции на нефтяные экономики сокращают глобальное предложение" },
      { asset: "💵 DXY", dir: "↑", reason: "США контролируют санкционный инструмент — доллар укрепляется" },
      { asset: "🥇 Золото", dir: "↑", reason: "Страны под санкциями наращивают золотые резервы как альтернативу доллару" },
    ],
  },

  // ── ВОЙНА / КОНФЛИКТЫ ────────────────────────────────────────────────────────
  {
    id: "war_conflict",
    keywords: ["war", "attack", "military", "troops", "airstrike", "invasion", "offensive"],
    negKeywords: ["trade war"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Классический защитный актив при геополитических кризисах" },
      { asset: "💵 DXY", dir: "↑", reason: "Бегство в качество — доллар как резервная валюта" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Риск нарушения цепочек поставок энергоносителей" },
      { asset: "📉 Фондовые рынки", dir: "↓", reason: "Рост неопределённости → распродажа рисковых активов" },
    ],
  },
  {
    id: "nuclear",
    keywords: ["nuclear", "missile", "explosion", "blast"],
    negKeywords: ["nuclear plant"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Экстремальный риск → масштабное бегство в защитные активы" },
      { asset: "💵 DXY + 🇨🇭 CHF", dir: "↑", reason: "Доллар и франк — главные активы-убежища при кризисах" },
      { asset: "📉 Все рисковые активы", dir: "↓", reason: "Паническая распродажа при угрозе ядерного конфликта" },
    ],
  },

  // ── ФРС / МОНЕТАРНАЯ ПОЛИТИКА ────────────────────────────────────────────────
  {
    id: "fed_hawkish",
    keywords: ["fed", "fomc", "federal reserve", "powell", "waller", "rate hike", "hawkish", "tightening"],
    negKeywords: ["rate cut", "dovish", "pause"],
    sentimentPos: ["hike", "hawkish", "tighten", "raise", "above expectations", "hot"],
    impacts: [
      { asset: "💵 DXY (Доллар)", dir: "↑", reason: "Повышение ставок → рост доходности → приток капитала в USD" },
      { asset: "🥇 Золото", dir: "↓", reason: "Высокие реальные ставки снижают привлекательность золота" },
      { asset: "📉 Облигации (Treasuries)", dir: "↓", reason: "Рост ставок → падение цен облигаций" },
      { asset: "🪙 Крипто (BTC/ETH)", dir: "↓", reason: "Ужесточение ликвидности давит на рисковые активы" },
    ],
  },
  {
    id: "fed_dovish",
    keywords: ["fed", "fomc", "federal reserve", "powell", "rate cut", "dovish", "pause", "easing"],
    negKeywords: ["rate hike", "hawkish"],
    sentimentPos: ["cut", "dovish", "pause", "ease", "lower", "below expectations"],
    impacts: [
      { asset: "💵 DXY (Доллар)", dir: "↓", reason: "Снижение ставок → ослабление доллара" },
      { asset: "🥇 Золото", dir: "↑", reason: "Низкие реальные ставки поддерживают золото" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Смягчение политики → рост аппетита к риску и спроса" },
      { asset: "🪙 Крипто (BTC/ETH)", dir: "↑", reason: "Дешёвая ликвидность поддерживает рисковые активы" },
    ],
  },

  // ── ЕЦБ / БОЕ / БОЯ ─────────────────────────────────────────────────────────
  {
    id: "ecb_policy",
    keywords: ["ecb", "lagarde", "european central bank", "eurozone rate"],
    negKeywords: [],
    impacts: [
      { asset: "🇪🇺 EUR/USD", dir: "↑↓", reason: "Решение ЕЦБ напрямую определяет курс евро" },
      { asset: "📉 Европейские облигации", dir: "↑↓", reason: "Монетарная политика ЕЦБ управляет доходностью гособлигаций ЕС" },
    ],
  },
  {
    id: "boj_policy",
    keywords: ["boj", "bank of japan", "ueda", "yield curve control", "ycc", "yen intervention"],
    negKeywords: [],
    impacts: [
      { asset: "🇯🇵 USD/JPY", dir: "↑↓", reason: "Политика BOJ критична для курса иены" },
      { asset: "🥇 Золото (в иенах)", dir: "↑↓", reason: "Ослабление иены увеличивает стоимость золота для японских инвесторов" },
    ],
  },

  // ── ИНФЛЯЦИЯ (CPI / PCE) ──────────────────────────────────────────────────────
  {
    id: "inflation_hot",
    keywords: ["cpi", "pce", "inflation", "price index", "price pressures"],
    negKeywords: ["cooling", "falls", "eases", "softens", "lower than"],
    sentimentPos: ["hot", "above", "surges", "rises", "beats", "higher than expected", "accelerates"],
    impacts: [
      { asset: "💵 DXY", dir: "↑", reason: "Горячая инфляция → рынки ждут повышения ставок ФРС" },
      { asset: "🥇 Золото", dir: "↑↓", reason: "Краткосрочно ↓ (ставки вверх), долгосрочно ↑ (инфляционный хедж)" },
      { asset: "📉 Гособлигации", dir: "↓", reason: "Инфляция съедает доходность → продажи трежерис" },
      { asset: "🛢️ Нефть / сырьё", dir: "↑", reason: "Сырьё — традиционный хедж от инфляции" },
    ],
  },
  {
    id: "inflation_cool",
    keywords: ["cpi", "pce", "inflation", "price index"],
    negKeywords: ["hot", "above", "surges", "beats", "higher than"],
    sentimentPos: ["cooling", "falls", "eases", "softens", "lower than expected", "slows"],
    impacts: [
      { asset: "💵 DXY", dir: "↓", reason: "Снижение инфляции → ожидания паузы/снижения ставок" },
      { asset: "🥇 Золото", dir: "↑", reason: "Мягкая инфляция → ожидания снижения ставок поддерживают золото" },
      { asset: "📈 Гособлигации", dir: "↑", reason: "Охлаждение инфляции → рост цен облигаций" },
    ],
  },

  // ── NFP / РЫНОК ТРУДА ─────────────────────────────────────────────────────────
  {
    id: "nfp_strong",
    keywords: ["nfp", "nonfarm", "payroll", "jobs", "employment", "unemployment"],
    negKeywords: [],
    sentimentPos: ["beats", "surges", "strong", "above", "better than expected", "added"],
    impacts: [
      { asset: "💵 DXY", dir: "↑", reason: "Сильный рынок труда → ФРС может держать высокие ставки дольше" },
      { asset: "🥇 Золото", dir: "↓", reason: "Снижается вероятность смягчения политики ФРС" },
      { asset: "📉 Гособлигации", dir: "↓", reason: "Доходность растёт на ожиданиях удержания ставок" },
    ],
  },
  {
    id: "nfp_weak",
    keywords: ["nfp", "nonfarm", "payroll", "jobs", "employment", "unemployment"],
    negKeywords: [],
    sentimentPos: ["misses", "weak", "below", "falls", "disappoints", "fewer than expected"],
    impacts: [
      { asset: "💵 DXY", dir: "↓", reason: "Слабый рынок труда → ФРС может раньше снизить ставки" },
      { asset: "🥇 Золото", dir: "↑", reason: "Ожидания смягчения монетарной политики поддерживают золото" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Слабый рынок труда → замедление экономики → снижение спроса" },
    ],
  },

  // ── GDP / ВВП ────────────────────────────────────────────────────────────────
  {
    id: "gdp_strong",
    keywords: ["gdp", "gross domestic product", "economic growth"],
    negKeywords: [],
    sentimentPos: ["beats", "strong", "above", "accelerates", "record"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↑", reason: "Сильный ВВП укрепляет национальную валюту" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Рост экономики → рост потребления энергии" },
    ],
  },
  {
    id: "gdp_weak",
    keywords: ["gdp", "gross domestic product", "economic growth", "recession"],
    negKeywords: [],
    sentimentPos: ["falls", "contraction", "misses", "weak", "recession", "shrinks", "negative"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Рецессионные риски → защитные активы растут" },
      { asset: "💵 DXY", dir: "↑↓", reason: "Зависит от страны: рецессия в США → USD ↓, в других → USD ↑" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Замедление экономики → снижение спроса на энергоносители" },
    ],
  },

  // ── ТОРГОВАЯ ВОЙНА / ТАРИФЫ ───────────────────────────────────────────────────
  {
    id: "trade_war",
    keywords: ["tariff", "tariffs", "trade war", "trade deal", "import duty", "trade dispute", "wto"],
    negKeywords: [],
    impacts: [
      { asset: "🥈 Медь / Сталь / Алюминий", dir: "↑↓", reason: "Тарифы прямо влияют на металлы через цепочки поставок" },
      { asset: "🌾 Соя / с/х товары", dir: "↑↓", reason: "Торговые войны затрагивают сельхозэкспорт" },
      { asset: "🇨🇳 CNY / 🇦🇺 AUD", dir: "↓", reason: "Страны-экспортёры страдают при торговой напряжённости" },
      { asset: "🥇 Золото", dir: "↑", reason: "Неопределённость → защитные активы" },
    ],
  },

  // ── ОПЕК / НЕФТЬ ────────────────────────────────────────────────────────────
  {
    id: "opec_cut",
    keywords: ["opec", "opec+", "production cut", "output cut", "saudi aramco", "saudi arabia"],
    negKeywords: ["production increase", "output increase", "raises output"],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "Сокращение добычи → дефицит предложения → рост цен" },
      { asset: "🇨🇦 CAD/USD", dir: "↑", reason: "Канада — крупный нефтеэкспортёр; нефть поддерживает CAD" },
      { asset: "🇳🇴 NOK (норвежская крона)", dir: "↑", reason: "Норвегия — ключевой нефтяной экспортёр в Европе" },
    ],
  },
  {
    id: "opec_raise",
    keywords: ["opec", "opec+", "production increase", "output increase", "raises output"],
    negKeywords: ["production cut", "output cut"],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↓", reason: "Рост добычи → увеличение предложения → давление на цены" },
      { asset: "🌍 EM-валюты нефтеимпортёров", dir: "↑", reason: "Дешёвая нефть снижает счёт текущих операций импортёров" },
    ],
  },

  // ── EIA / ЗАПАСЫ НЕФТИ ───────────────────────────────────────────────────────
  {
    id: "eia_drawdown",
    keywords: ["eia", "crude inventories", "oil inventories", "crude draw", "stockpiles"],
    negKeywords: [],
    sentimentPos: ["draw", "decline", "fell", "less than expected", "deficit"],
    impacts: [
      { asset: "🛢️ Нефть (WTI)", dir: "↑", reason: "Снижение запасов сигнализирует о сильном спросе или дефиците" },
    ],
  },
  {
    id: "eia_build",
    keywords: ["eia", "crude inventories", "oil inventories", "crude build", "stockpiles"],
    negKeywords: [],
    sentimentPos: ["build", "rise", "gain", "more than expected", "surplus", "increase"],
    impacts: [
      { asset: "🛢️ Нефть (WTI)", dir: "↓", reason: "Рост запасов → избыток предложения давит на цены" },
    ],
  },

  // ── ЗОЛОТО / ДРАГМЕТАЛЛЫ ─────────────────────────────────────────────────────
  {
    id: "gold_demand",
    keywords: ["gold", "xau", "bullion", "central bank gold", "gold reserves"],
    negKeywords: [],
    sentimentPos: ["buys", "purchases", "adds", "increases", "record", "demand"],
    impacts: [
      { asset: "🥇 Золото (XAU/USD)", dir: "↑", reason: "Рост спроса от ЦБ или инвесторов поддерживает золото" },
      { asset: "🥈 Серебро (XAG/USD)", dir: "↑", reason: "Серебро коррелирует с золотом как защитный металл" },
    ],
  },

  // ── ДОЛЛАР / DXY ─────────────────────────────────────────────────────────────
  {
    id: "dollar_strong",
    keywords: ["dollar", "usd", "dxy", "dollar index"],
    negKeywords: [],
    sentimentPos: ["surges", "rallies", "rises", "strengthens", "gains", "highs"],
    impacts: [
      { asset: "🥇 Золото", dir: "↓", reason: "Сильный доллар делает золото дороже для нерезидентов" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Нефть торгуется в USD — сильный доллар давит на цену" },
      { asset: "🌍 EM-активы", dir: "↓", reason: "Крепкий доллар ужесточает условия для развивающихся рынков" },
    ],
  },

  // ── РЕЦЕССИЯ / КРИЗИС ────────────────────────────────────────────────────────
  {
    id: "recession",
    keywords: ["recession", "bank run", "credit crunch", "financial crisis", "default", "collapse", "lehman"],
    negKeywords: [],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Глубокий кризис → исторически максимальный спрос на золото" },
      { asset: "💵 DXY", dir: "↑", reason: "Долларовый дефицит при кризисе → краткосрочный рост USD" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Рецессия → сокращение промышленного потребления энергии" },
      { asset: "🪙 Крипто", dir: "↓", reason: "Рисковые активы распродаются в условиях кризиса" },
    ],
  },

  // ── КРИПТО ────────────────────────────────────────────────────────────────────
  {
    id: "crypto_news",
    keywords: ["bitcoin", "btc", "ethereum", "crypto", "sec crypto", "etf bitcoin"],
    negKeywords: [],
    impacts: [
      { asset: "🪙 BTC/ETH", dir: "↑↓", reason: "Новости по регулированию или институциональному спросу прямо влияют на крипторынок" },
      { asset: "📈 Рисковые активы", dir: "↑↓", reason: "Крипто коррелирует с Nasdaq при изменении риск-аппетита" },
    ],
  },

  // ── PMI / ДЕЛОВАЯ АКТИВНОСТЬ ─────────────────────────────────────────────────
  {
    id: "pmi_strong",
    keywords: ["pmi", "manufacturing", "services", "business activity", "ifo", "zew"],
    negKeywords: [],
    sentimentPos: ["beats", "above 50", "expansion", "improves", "rises", "record"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↑", reason: "PMI выше 50 → экономика расширяется → валюта укрепляется" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Рост производства → рост потребления энергии" },
    ],
  },
  {
    id: "pmi_weak",
    keywords: ["pmi", "manufacturing", "services", "business activity", "ifo", "zew"],
    negKeywords: [],
    sentimentPos: ["misses", "below 50", "contraction", "falls", "weakens", "slowdown"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↓", reason: "PMI ниже 50 → экономика сжимается → валюта слабеет" },
      { asset: "🥇 Золото", dir: "↑", reason: "Слабые данные → ожидания смягчения ЦБ → золото растёт" },
    ],
  },

  // ── ТРАМП / ГЕОПОЛИТИКА США ──────────────────────────────────────────────────
  {
    id: "trump_tariffs",
    keywords: ["trump", "tariff", "white house", "executive order"],
    negKeywords: [],
    impacts: [
      { asset: "💵 DXY", dir: "↑↓", reason: "Протекционизм краткосрочно поддерживает USD, но создаёт риски" },
      { asset: "🥇 Золото", dir: "↑", reason: "Неопределённость торговой политики → защитные активы" },
      { asset: "🇨🇳 CNY / EM-валюты", dir: "↓", reason: "Тарифы наиболее болезненны для экспортёров в США" },
    ],
  },

  // ── ПРИРОДНЫЙ ГАЗ / ЭНЕРГЕТИКА ──────────────────────────────────────────────
  {
    id: "natgas",
    keywords: ["natural gas", "lng", "gas pipeline", "gas supply", "nordstream", "ttf", "henry hub"],
    negKeywords: [],
    impacts: [
      { asset: "⚡ Природный газ (TTF/HH)", dir: "↑↓", reason: "Перебои в поставках или данные о запасах двигают цену газа" },
      { asset: "🇪🇺 EUR/USD", dir: "↓", reason: "Дорогой газ повышает энергозатраты европейской промышленности" },
    ],
  },

  // ── ЯПОНСКАЯ ИЕНА ────────────────────────────────────────────────────────────
  {
    id: "yen_intervention",
    keywords: ["yen", "jpy", "intervention", "mof japan", "boj intervention"],
    negKeywords: [],
    impacts: [
      { asset: "🇯🇵 USD/JPY", dir: "↑↓", reason: "Прямая интервенция BOJ/MoF способна резко двинуть иену" },
      { asset: "🥇 Золото (в JPY)", dir: "↑↓", reason: "Движения иены меняют локальную стоимость золота для Японии" },
    ],
  },
];

// ─── Sentiment detection ──────────────────────────────────────────────────────

function detectSentiment(text) {
  const negativeWords = [
    "falls", "drops", "decline", "weak", "miss", "disappoints", "contraction",
    "below", "slowdown", "cut", "reduces", "shrinks", "loses", "crisis",
    "concern", "risk", "threat", "warning", "below expectations",
  ];
  const positiveWords = [
    "rises", "gains", "beats", "strong", "surges", "record", "above",
    "expansion", "growth", "recovery", "stimulus", "adds", "increases",
    "better than expected", "above expectations",
  ];
  let score = 0;
  for (const w of negativeWords) if (text.includes(w)) score--;
  for (const w of positiveWords) if (text.includes(w)) score++;
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
}

function matchesRule(rule, text) {
  const hasKeyword = rule.keywords.some((kw) => text.includes(kw));
  if (!hasKeyword) return false;

  const hasNeg = rule.negKeywords?.some((kw) => text.includes(kw));
  if (hasNeg) return false;

  // Если у правила есть sentimentPos — проверяем наличие хотя бы одного из них
  if (rule.sentimentPos) {
    const hasSentiment = rule.sentimentPos.some((kw) => text.includes(kw));
    if (!hasSentiment) return false;
  }
  if (rule.sentimentNeg) {
    const hasSentiment = rule.sentimentNeg.some((kw) => text.includes(kw));
    if (!hasSentiment) return false;
  }

  return true;
}

function generateAnalytics(titleEn, descEn) {
  const text = `${titleEn} ${descEn}`.toLowerCase();
  const matchedImpacts = [];
  const seenAssets = new Set();

  for (const rule of ANALYTICS_RULES) {
    if (!matchesRule(rule, text)) continue;
    for (const impact of rule.impacts) {
      if (seenAssets.has(impact.asset)) continue;
      seenAssets.add(impact.asset);
      matchedImpacts.push(impact);
    }
  }

  if (matchedImpacts.length === 0) return null;

  // Ограничиваем до топ-4 самых важных
  const top = matchedImpacts.slice(0, 4);
  const lines = top.map((imp) => `  ${imp.dir} *${imp.asset}* — _${imp.reason}_`);
  return `📊 *Аналитика:*\n${lines.join("\n")}`;
}

// ─── State ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVip(text) {
  return VIP_KEYWORDS.some((kw) => text.includes(kw));
}

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
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`;
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

      // Чёрный список
      if (STOCK_BLACKLIST.some((kw) => fullText.includes(kw))) continue;

      // Фильтрация
      if (strict) {
        if (!VIP_KEYWORDS.some((kw) => fullText.includes(kw))) continue;
      } else {
        if (!GOOD_KEYWORDS.some((kw) => fullText.includes(kw))) continue;
      }

      sentArticles.add(titleEn);

      const shortDesc = cleanDesc.length > 300 ? cleanDesc.slice(0, 300) + "…" : cleanDesc;
      const shortTitleEn = titleEn.length > 200 ? titleEn.slice(0, 200) + "…" : titleEn; // оставил для логирования

      const [titleRu, descRu] = await Promise.all([
        translateToRussian(titleEn),
        translateToRussian(shortDesc),
      ]);

      const vip = isVip(fullText);
      const header = vip ? "🔴 *News Craig Breaking*" : "⚡️ *News Craig Macro*";
      const descBlock = descRu ? `📝 ${descRu}\n\n` : "";

      // Генерируем аналитику
      const analyticsBlock = generateAnalytics(titleEn, cleanDesc);
      const analyticsSection = analyticsBlock ? `\n\n${analyticsBlock}` : "";

      const message = (
        `${header}\n\n` +
        `📌 *${titleRu}*\n\n` +
        `${descBlock}` +
        `${analyticsSection}\n\n` +
        `🔗 [Источник](${link})`
      ).slice(0, 4096);

      await sendTelegram(message);
      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}]${analyticsBlock ? " [ANALYTICS]" : ""} ${titleEn}`);

      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error(`Feed error (${feedUrl}):`, err);
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

      const flag = CURRENCY_FLAG[event.country] ?? "🌐";
      const timeStr = new Date(event.date).toLocaleTimeString("ru-RU", {
        hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
      });
      const titleRu = await translateToRussian(event.title);

      // Аналитика для события
      const analyticsBlock = generateAnalytics(event.title, event.title);
      const analyticsSection = analyticsBlock ? `\n\n${analyticsBlock}` : "";

      await sendTelegram(
        `⏰ *ЧЕРЕЗ 15 МИНУТ | ВЫСОКИЙ ПРИОРИТЕТ*\n\n` +
        `${flag} *${titleRu}*\n🇬🇧 _${event.title}_\n\n` +
        `${event.forecast ? `📊 Прогноз: *${event.forecast}*\n` : ""}` +
        `${event.previous ? `📉 Пред. значение: ${event.previous}\n` : ""}` +
        `🕐 Время выхода: *${timeStr} МСК*` +
        `${analyticsSection}`
      );
      console.log(`[${new Date().toISOString()}] [REMINDER] ${event.title}`);
    }
  } catch (err) {
    console.error("Calendar error:", err);
  }
}

// ─── Price alerts ─────────────────────────────────────────────────────────────

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
  {
    symbol: "HG=F", label: "Медь (HG)", emoji: "🥈", unit: "$",
    levels: [
      { price: 3.5, direction: "below", alerted: false },
      { price: 4.0, direction: "below", alerted: false },
      { price: 4.5, direction: "above", alerted: false },
      { price: 5.0, direction: "above", alerted: false },
    ],
  },
];

async function fetchPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
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

// ─── Session open alerts ──────────────────────────────────────────────────────

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

// ─── Weekly digest ────────────────────────────────────────────────────────────

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

// ─── Daily digest ─────────────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_TOKEN and TELEGRAM_CHAT_ID must be set.");
    process.exit(1);
  }

  console.log("🚀 News Craig v2 started.");
  await sendTelegram(
    "🚀 *News Craig v2 запущен!*\n\n" +
    "🔴 Срочные новости — приоритетный формат\n" +
    "⚡️ Обычные макро-новости — стандартный формат\n" +
    "📊 *Аналитика по каждой новости* — влияние на активы\n" +
    "⏰ Напоминания за 15 минут до выхода данных\n" +
    "📈 Ценовые алерты: Золото, WTI, Brent, DXY, Медь\n" +
    "🔔 Открытие торговых сессий (с учётом летнего времени)\n" +
    "📰 Источники: InvestingLive, MarketWatch, Reuters, ForexLive"
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

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
