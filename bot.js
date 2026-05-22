import RSSParser from "rss-parser";

const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const POLL_INTERVAL_MS     = 15_000;
const CALENDAR_INTERVAL_MS = 60_000;
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const FEEDS = [
  { url: "https://feeds.bloomberg.com/markets/news.rss" },
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
  "analyst rating", "price target", "upgrade", "downgrade",
  "outperform", "underperform", "buy rating", "sell rating",
  "hedge fund", "portfolio", "etf holdings",
  "apple", "microsoft", "google", "alphabet", "amazon", "meta",
  "tesla", "nvidia", "berkshire", "jpmorgan", "goldman sachs",
  "exxon", "chevron", "shell", "bp ", "totalenergies",
  "bank of america", "citigroup", "wells fargo",
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

// ─── Торговые сигналы ─────────────────────────────────────────────────────────
//
// Структура: keywords[] — триггеры новости
//            signals[]  — список инструментов (не более 5 на событие)
//
// SL / TP указаны в пипсах в стандартных обозначениях брокера:
//   Форекс-мажоры:     1 pip = 0.0001  (4-знак)
//   USDJPY / USDCNH:   1 pip = 0.01    (2-знак)
//   Золото XAUUSD:     1 pip = 0.01    → $0.01/pip/лот
//   Серебро XAGUSD:    1 pip = 0.001
//   Нефть XTIUSD/XBR:  1 pip = 0.01
//   Медь XCUUSD:       1 pip = 0.0001
//   Натгаз XNGUSD:     1 pip = 0.001
//   Индексы US500 и т.д.: 1 pip = 0.1 пункта
//
// R/R у всех правил = 1:2 минимум.

const SIGNAL_RULES = [

  // ══════════════════════════════════════════════════════
  //  ГЕОПОЛИТИКА — война, ядерная угроза, взрывы
  // ══════════════════════════════════════════════════════
  {
    keywords: ["nuclear", "missile strike", "war escalat", "explosion", "attack on", "aerial attack", "troops cross"],
    label: "Геополитический кризис",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Бегство в золото" },
      { instrument: "XAGUSD", direction: "BUY",  sl: 500,  tp: 1000, logic: "Серебро как защитный металл" },
      { instrument: "USDCHF", direction: "SELL", sl: 30,   tp: 60,   logic: "Франк — защитная валюта (растёт)" },
      { instrument: "USDJPY", direction: "SELL", sl: 40,   tp: 80,   logic: "Иена — защитная валюта (растёт)" },
      { instrument: "US500",  direction: "SELL", sl: 60,   tp: 120,  logic: "Риск-офф → продажи индексов" },
    ],
  },
  {
    keywords: ["mideast tension", "iran attack", "red sea attack", "houthi", "strait of hormuz"],
    label: "Ближний Восток / угроза нефтяным поставкам",
    signals: [
      { instrument: "XTIUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Угроза поставкам → нефть вверх" },
      { instrument: "XBRUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Brent реагирует на Ближний Восток" },
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Геополитика → золото вверх" },
      { instrument: "USDCAD", direction: "SELL", sl: 25,   tp: 50,   logic: "Нефть вверх → канадский доллар растёт" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  ФРС — повышение ставки / ястреб
  // ══════════════════════════════════════════════════════
  {
    keywords: ["rate hike", "raises rates", "fomc hike", "50bp hike", "75bp", "100bp", "hawkish surprise", "hawkish fed"],
    label: "ФРС повышает ставку",
    signals: [
      { instrument: "USDJPY", direction: "BUY",  sl: 40,   tp: 80,   logic: "Доллар усиливается vs иена" },
      { instrument: "EURUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "Доллар усиливается vs евро" },
      { instrument: "GBPUSD", direction: "SELL", sl: 30,   tp: 60,   logic: "Доллар усиливается vs фунт" },
      { instrument: "XAUUSD", direction: "SELL", sl: 400,  tp: 800,  logic: "Высокие ставки давят на золото" },
      { instrument: "NAS100", direction: "SELL", sl: 150,  tp: 300,  logic: "Ставки вверх → tech-акции под давлением" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  ФРС — снижение ставки / голубь / разворот
  // ══════════════════════════════════════════════════════
  {
    keywords: ["rate cut", "cuts rates", "fomc cut", "emergency cut", "dovish surprise", "dovish fed", "pivot", "rate pause"],
    label: "ФРС снижает ставку",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Низкие ставки → золото вверх" },
      { instrument: "EURUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Доллар слабеет → евро растёт" },
      { instrument: "GBPUSD", direction: "BUY",  sl: 30,   tp: 60,   logic: "Доллар слабеет → фунт растёт" },
      { instrument: "AUDUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Риск-он → AUD как рисковая валюта" },
      { instrument: "US500",  direction: "BUY",  sl: 60,   tp: 120,  logic: "Снижение ставок → рост индексов" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  ЕЦБ — ставка
  // ══════════════════════════════════════════════════════
  {
    keywords: ["ecb hike", "ecb raises", "ecb hawkish", "lagarde hawkish"],
    label: "ЕЦБ повышает ставку",
    signals: [
      { instrument: "EURUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "ЕЦБ ястреб → евро укрепляется" },
      { instrument: "EURGBP", direction: "BUY",  sl: 20,   tp: 40,   logic: "Дифференциал ставок ЕЦБ/BoE" },
      { instrument: "EURJPY", direction: "BUY",  sl: 40,   tp: 80,   logic: "Евро вверх vs иена" },
    ],
  },
  {
    keywords: ["ecb cut", "ecb dovish", "lagarde dovish", "ecb pauses"],
    label: "ЕЦБ снижает ставку",
    signals: [
      { instrument: "EURUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "ЕЦБ голубь → евро слабеет" },
      { instrument: "EURGBP", direction: "SELL", sl: 20,   tp: 40,   logic: "Евро слабеет vs фунт" },
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Снижение ставок в EUR → золото" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Банк Англии (BoE)
  // ══════════════════════════════════════════════════════
  {
    keywords: ["boe hike", "boe raises", "boe hawkish", "bailey hawkish", "bank of england hike"],
    label: "Банк Англии повышает ставку",
    signals: [
      { instrument: "GBPUSD", direction: "BUY",  sl: 30,   tp: 60,   logic: "BoE ястреб → фунт укрепляется" },
      { instrument: "EURGBP", direction: "SELL", sl: 20,   tp: 40,   logic: "Фунт сильнее евро" },
    ],
  },
  {
    keywords: ["boe cut", "boe dovish", "bailey dovish", "bank of england cut"],
    label: "Банк Англии снижает ставку",
    signals: [
      { instrument: "GBPUSD", direction: "SELL", sl: 30,   tp: 60,   logic: "BoE голубь → фунт слабеет" },
      { instrument: "EURGBP", direction: "BUY",  sl: 20,   tp: 40,   logic: "Фунт слабее евро" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Банк Японии (BoJ) / Иена
  // ══════════════════════════════════════════════════════
  {
    keywords: ["yen intervention", "boj intervention", "japan intervene", "mof intervenes"],
    label: "Интервенция Банка Японии",
    signals: [
      { instrument: "USDJPY", direction: "SELL", sl: 80,   tp: 160,  logic: "BoJ купил иену → резкое укрепление" },
      { instrument: "EURJPY", direction: "SELL", sl: 80,   tp: 160,  logic: "Иена растёт vs все" },
    ],
  },
  {
    keywords: ["boj hike", "boj raises", "boj hawkish", "japan rate hike", "ueda hawkish"],
    label: "Банк Японии повышает ставку",
    signals: [
      { instrument: "USDJPY", direction: "SELL", sl: 50,   tp: 100,  logic: "BoJ ястреб → иена укрепляется" },
      { instrument: "EURJPY", direction: "SELL", sl: 60,   tp: 120,  logic: "Иена растёт vs евро" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Нефть — рост
  // ══════════════════════════════════════════════════════
  {
    keywords: ["oil spike", "opec cut", "opec+ cut", "opec production cut", "crude surge", "supply disruption", "iran oil sanction", "oil embargo"],
    label: "Нефть — шок предложения (рост)",
    signals: [
      { instrument: "XTIUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Сокращение добычи → WTI вверх" },
      { instrument: "XBRUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Brent реагирует аналогично" },
      { instrument: "USDCAD", direction: "SELL", sl: 25,   tp: 50,   logic: "Нефть вверх → CAD укрепляется" },
      { instrument: "NZDUSD", direction: "SELL", sl: 20,   tp: 40,   logic: "Энергоимпортёр под давлением" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Нефть — падение
  // ══════════════════════════════════════════════════════
  {
    keywords: ["oil crash", "opec+ increase", "opec hike output", "oil glut", "crude plunge", "oil demand falls", "oil surplus"],
    label: "Нефть — избыток предложения (падение)",
    signals: [
      { instrument: "XTIUSD", direction: "SELL", sl: 100,  tp: 200,  logic: "Рост добычи → WTI вниз" },
      { instrument: "XBRUSD", direction: "SELL", sl: 100,  tp: 200,  logic: "Brent аналогично" },
      { instrument: "USDCAD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Нефть вниз → CAD слабеет" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Природный газ
  // ══════════════════════════════════════════════════════
  {
    keywords: ["natural gas surge", "lng shortage", "gas supply cut", "pipeline shut", "cold snap", "gas crisis"],
    label: "Природный газ — дефицит / рост",
    signals: [
      { instrument: "XNGUSD", direction: "BUY",  sl: 200,  tp: 400,  logic: "Дефицит предложения → газ вверх" },
      { instrument: "EURGBP", direction: "BUY",  sl: 20,   tp: 40,   logic: "Европа — энергоимпортёр, евро под давлением" },
    ],
  },
  {
    keywords: ["natural gas plunge", "gas glut", "gas oversupply", "lng oversupply"],
    label: "Природный газ — избыток / падение",
    signals: [
      { instrument: "XNGUSD", direction: "SELL", sl: 200,  tp: 400,  logic: "Избыток поставок → газ вниз" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Золото
  // ══════════════════════════════════════════════════════
  {
    keywords: ["gold surge", "gold rally", "gold hits record", "gold all-time high", "bullion demand", "central bank gold", "gold reserve"],
    label: "Золото — спрос / рост",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Спрос на золото растёт" },
      { instrument: "XAGUSD", direction: "BUY",  sl: 500,  tp: 1000, logic: "Серебро следует за золотом" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Медь / промышленные металлы
  // ══════════════════════════════════════════════════════
  {
    keywords: ["copper surge", "copper rally", "china demand copper", "infrastructure spending", "green energy demand"],
    label: "Медь — промышленный спрос",
    signals: [
      { instrument: "XCUUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Промышленный спрос / Китай → медь вверх" },
      { instrument: "AUDUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Австралия — экспортёр меди" },
    ],
  },
  {
    keywords: ["copper crash", "copper plunge", "china slowdown", "manufacturing contraction"],
    label: "Медь — промышленный спад",
    signals: [
      { instrument: "XCUUSD", direction: "SELL", sl: 100,  tp: 200,  logic: "Слабый спрос / рецессия → медь вниз" },
      { instrument: "AUDUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "Австралия под давлением" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Тарифы / Китай
  // ══════════════════════════════════════════════════════
  {
    keywords: ["tariff hike", "tariffs on china", "tariffs on europe", "trade war escalat", "trump tariff", "tariff increase"],
    label: "Тарифное обострение",
    signals: [
      { instrument: "USDCNH", direction: "BUY",  sl: 60,   tp: 120,  logic: "Тарифы → юань слабеет" },
      { instrument: "AUDUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "Китай под давлением → AUD слабеет" },
      { instrument: "XCUUSD", direction: "SELL", sl: 100,  tp: 200,  logic: "Торговая война → медь вниз" },
      { instrument: "US500",  direction: "SELL", sl: 60,   tp: 120,  logic: "Торговая неопределённость → индексы вниз" },
    ],
  },
  {
    keywords: ["tariff pause", "tariff exemption", "trade deal signed", "trade agreement", "trade truce"],
    label: "Тарифное перемирие",
    signals: [
      { instrument: "USDCNH", direction: "SELL", sl: 60,   tp: 120,  logic: "Перемирие → юань укрепляется" },
      { instrument: "AUDUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Риск-он → AUD растёт" },
      { instrument: "XCUUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Торговля восстанавливается → медь вверх" },
      { instrument: "US500",  direction: "BUY",  sl: 60,   tp: 120,  logic: "Риск-он → индексы вверх" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Австралия / RBA
  // ══════════════════════════════════════════════════════
  {
    keywords: ["rba hike", "rba hawkish", "australia rate hike", "rba raises"],
    label: "RBA повышает ставку",
    signals: [
      { instrument: "AUDUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "RBA ястреб → AUD укрепляется" },
      { instrument: "AUDCAD", direction: "BUY",  sl: 25,   tp: 50,   logic: "AUD vs CAD — дифференциал ставок" },
    ],
  },
  {
    keywords: ["rba cut", "rba dovish", "australia rate cut", "rba lowers"],
    label: "RBA снижает ставку",
    signals: [
      { instrument: "AUDUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "RBA голубь → AUD слабеет" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Рецессия / финансовый кризис / дефолт
  // ══════════════════════════════════════════════════════
  {
    keywords: ["recession confirmed", "bank collapse", "bank run", "sovereign default", "credit crunch", "systemic risk", "financial crisis", "bailout"],
    label: "Рецессия / финансовый кризис",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Кризис → бегство в золото" },
      { instrument: "USDCHF", direction: "SELL", sl: 30,   tp: 60,   logic: "Кризис → CHF как safe haven" },
      { instrument: "US500",  direction: "SELL", sl: 80,   tp: 160,  logic: "Рецессия → индексы вниз" },
      { instrument: "AUDUSD", direction: "SELL", sl: 30,   tp: 60,   logic: "Риск-офф → AUD под давлением" },
      { instrument: "XNGUSD", direction: "BUY",  sl: 200,  tp: 400,  logic: "Кризис → энергия востребована" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Инфляция выше ожиданий (CPI/PCE beat)
  // ══════════════════════════════════════════════════════
  {
    keywords: ["cpi beat", "inflation surges", "inflation higher than", "hot inflation", "pce beat", "core inflation rises"],
    label: "Инфляция выше ожиданий",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Высокая инфляция → золото как защита" },
      { instrument: "USDJPY", direction: "BUY",  sl: 40,   tp: 80,   logic: "Ожидания ужесточения ФРС → доллар вверх" },
      { instrument: "US500",  direction: "SELL", sl: 60,   tp: 120,  logic: "Высокая инфляция → ожидания роста ставок" },
      { instrument: "XTIUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Инфляция частично нефтяная" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Инфляция ниже ожиданий (CPI miss)
  // ══════════════════════════════════════════════════════
  {
    keywords: ["cpi miss", "inflation drops", "inflation lower than", "deflation", "pce miss", "core inflation falls"],
    label: "Инфляция ниже ожиданий",
    signals: [
      { instrument: "EURUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Голубиные ожидания → доллар слабеет" },
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Ожидания снижения ставок → золото вверх" },
      { instrument: "NAS100", direction: "BUY",  sl: 150,  tp: 300,  logic: "Снижение ставок выгодно tech" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  NFP / Рынок труда США — сильные данные
  // ══════════════════════════════════════════════════════
  {
    keywords: ["nfp beat", "nonfarm beat", "jobs beat", "strong jobs", "unemployment falls", "labor market strong"],
    label: "NFP — сильные данные",
    signals: [
      { instrument: "USDJPY", direction: "BUY",  sl: 40,   tp: 80,   logic: "Сильный рынок труда → доллар вверх" },
      { instrument: "EURUSD", direction: "SELL", sl: 25,   tp: 50,   logic: "Доллар усиливается vs евро" },
      { instrument: "XAUUSD", direction: "SELL", sl: 400,  tp: 800,  logic: "Сильные данные → давление на золото" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  NFP / Рынок труда США — слабые данные
  // ══════════════════════════════════════════════════════
  {
    keywords: ["nfp miss", "nonfarm miss", "jobs miss", "weak jobs", "unemployment rises", "jobless claims surge"],
    label: "NFP — слабые данные",
    signals: [
      { instrument: "EURUSD", direction: "BUY",  sl: 25,   tp: 50,   logic: "Слабый рынок труда → доллар слабеет" },
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Слабые данные → голубиные ожидания → золото" },
      { instrument: "US500",  direction: "SELL", sl: 60,   tp: 120,  logic: "Слабая занятость → опасения рецессии" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Санкции против России
  // ══════════════════════════════════════════════════════
  {
    keywords: ["russia sanctions", "sanction russia", "new sanctions on russia", "energy sanctions"],
    label: "Санкции против России",
    signals: [
      { instrument: "XTIUSD", direction: "BUY",  sl: 100,  tp: 200,  logic: "Санкции → нефтяные поставки под угрозой" },
      { instrument: "XNGUSD", direction: "BUY",  sl: 200,  tp: 400,  logic: "Газовые поставки под угрозой" },
      { instrument: "XAUUSD", direction: "BUY",  sl: 400,  tp: 800,  logic: "Геополитика → золото вверх" },
    ],
  },

  // ══════════════════════════════════════════════════════
  //  Чрезвычайные события / Flash Crash
  // ══════════════════════════════════════════════════════
  {
    keywords: ["flash crash", "market circuit breaker", "trading halt", "emergency meeting fed", "emergency rate"],
    label: "Чрезвычайная ситуация на рынках",
    signals: [
      { instrument: "XAUUSD", direction: "BUY",  sl: 500,  tp: 1000, logic: "Паника → золото резко вверх" },
      { instrument: "USDCHF", direction: "SELL", sl: 40,   tp: 80,   logic: "Паника → CHF safe haven" },
      { instrument: "US500",  direction: "SELL", sl: 100,  tp: 200,  logic: "Flash crash → индекс вниз" },
      { instrument: "NAS100", direction: "SELL", sl: 200,  tp: 400,  logic: "Tech падает сильнее в панике" },
    ],
  },
];

// ─── Анализ сигналов ──────────────────────────────────────────────────────────

function analyzeForSignals(fullText) {
  const found = [];
  const seenInstruments = new Set();

  for (const rule of SIGNAL_RULES) {
    if (!rule.keywords.some((kw) => fullText.includes(kw))) continue;

    for (const sig of rule.signals) {
      if (!seenInstruments.has(sig.instrument)) {
        found.push({ ...sig, ruleLabel: rule.label });
        seenInstruments.add(sig.instrument);
      }
    }
  }

  return found;
}

function formatSignalMessage(signals, titleRu) {
  if (signals.length === 0) return null;

  const dirEmoji = (d) => d === "BUY" ? "🟢 ПОКУПКА" : "🔴 ПРОДАЖА";
  const rr       = (sl, tp) => (tp / sl).toFixed(1);

  const eventLabel = signals[0]?.ruleLabel ?? "";

  let msg = `📊 *ТОРГОВЫЙ СИГНАЛ — ${eventLabel}*\n\n`;
  msg    += `📰 _${titleRu.slice(0, 130)}_\n`;

  for (const sig of signals) {
    msg +=
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `*${sig.instrument}* — ${dirEmoji(sig.direction)}\n` +
      `🛑 SL: ${sig.sl} пп  |  🎯 TP: ${sig.tp} пп  |  R/R 1:${rr(sig.sl, sig.tp)}\n` +
      `💡 ${sig.logic}`;
  }

  msg += `\n\n⚠️ _Сигнал информационный — решение за тобой_`;
  return msg.slice(0, 4096);
}

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
const MSG_SEND_DELAY_MS  = 5_000;
const sentReminders = new Set();
let digestSentForWeek     = "";
let dailyDigestSentForDay = "";

const parser = new RSSParser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVip(text) { return VIP_KEYWORDS.some((kw) => text.includes(kw)); }

function getLocalHHMM(tz) {
  const s = new Date().toLocaleTimeString("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [h, m] = s.replace("24:", "00:").split(":").map(Number);
  return { hour: h, minute: m };
}

function moscowHour()           { return getLocalHHMM("Europe/Moscow").hour; }
function currentMoscowDateKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
}
function currentMoscowWeekKey() {
  const now  = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
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

// ─── Translation ──────────────────────────────────────────────────────────────

async function translateToRussian(text) {
  if (!text || !text.trim()) return "";
  if (/[а-яёА-ЯЁ]/.test(text) && (text.match(/[а-яёА-ЯЁ]/g) || []).length > text.length * 0.3) {
    return text;
  }
  const endpoints = [
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`,
    `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`,
    `https://translate.google.com/m?sl=en&tl=ru&q=${encodeURIComponent(text)}`,
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt < 2) {
        const res = await fetch(endpoints[attempt], {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const data = await res.json();
          const t    = data[0].map((s) => s[0]).join("").trim();
          if (t && /[а-яёА-ЯЁ]/.test(t)) return t;
        }
      } else {
        const res = await fetch(endpoints[2], {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const html  = await res.text();
          const match = html.match(/class="result-container"[^>]*>([^<]+)</);
          if (match?.[1]) {
            const t = match[1].trim();
            if (t && /[а-яёА-ЯЁ]/.test(t)) return t;
          }
        }
      }
    } catch { /* continue */ }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn(`[Translate] Не удалось перевести: "${text.slice(0, 60)}..."`);
  return text;
}

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
    sendToChat(TELEGRAM_CHANNEL,  text),
  ]);
}

// ─── News feed polling ────────────────────────────────────────────────────────

async function checkFeed(feedUrl, strict = false, silentMode = false) {
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

      if (silentMode) { sentArticles.add(key); continue; }

      const cleanDesc = descEn
        .replace(/\s*This article was written by .+?\./gi, "")
        .replace(/\s*Read more at .+?\./gi, "")
        .trim();

      const fullText = `${titleEn} ${cleanDesc}`.toLowerCase();

      if (STOCK_BLACKLIST.some((kw) => fullText.includes(kw))) continue;
      if (strict) {
        if (!VIP_KEYWORDS.some((kw)  => fullText.includes(kw))) continue;
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

      await sendTelegram((
        `${header}\n\n` +
        `📌 *${titleRu}*\n\n` +
        `${descBlock}` +
        `🔗 [Источник](${link})`
      ).slice(0, 4096));

      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}] ${titleEn}`);

      if (vip) {
        const signals = analyzeForSignals(fullText);
        const sigMsg  = formatSignalMessage(signals, titleRu);
        if (sigMsg) {
          await new Promise((r) => setTimeout(r, 1500));
          await sendTelegram(sigMsg);
          console.log(`[SIGNAL] ${signals.map((s) => `${s.instrument} ${s.direction}`).join(" | ")}`);
        }
      }

      await new Promise((r) => setTimeout(r, MSG_SEND_DELAY_MS));
    }
  } catch (err) {
    console.error(`[Feed] Error (${feedUrl}):`, err.message);
  }
}

async function checkAllFeeds(silentMode = false) {
  for (const feed of FEEDS) await checkFeed(feed.url, feed.strict ?? false, silentMode);
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
    const events     = await res.json();
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
        const fc = event.forecast ? ` · Прогноз: ${event.forecast}` : "";
        const pr = event.previous ? ` · Пред: ${event.previous}` : "";
        body += `  ${flag} ${timeStr} МСК — *${event.title}*${fc}${pr}\n`;
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
      const fc = event.forecast ? ` · Прогноз: *${event.forecast}*` : "";
      const pr = event.previous ? ` · Пред: ${event.previous}` : "";
      body += `\n${flag} *${timeStr} МСК* — ${event.title}${fc}${pr}`;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM_TOKEN and TELEGRAM_CHAT_ID must be set.");
    process.exit(1);
  }

  console.log("🚀 News Craig v5 started.");

  console.log("[Init] Тихий прогон фидов для предотвращения дублей...");
  await checkAllFeeds(true);
  console.log("[Init] Готово. Начинаем мониторинг.");

  await sendTelegram(
    "🚀 *News Craig v5 запущен!*\n\n" +
    "🔴 Срочные новости — приоритетный формат\n" +
    "⚡️ Обычные макро-новости — стандартный формат\n" +
    "📊 Торговые сигналы: Forex · Металлы · Нефть · Газ · Индексы\n" +
    "🌐 Перевод через Google Translate\n" +
    "⏰ Напоминания за 15 минут до выхода данных\n" +
    "📰 Источники: Bloomberg, ForexLive"
  );

  await checkCalendarReminders();

  setInterval(checkAllFeeds,          POLL_INTERVAL_MS);
  setInterval(checkCalendarReminders, CALENDAR_INTERVAL_MS);
  setInterval(checkWeeklyDigest,      CALENDAR_INTERVAL_MS);
  setInterval(checkDailyDigest,       CALENDAR_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
