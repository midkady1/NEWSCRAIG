import RSSParser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_CHANNEL = "@newscraig";
const POLL_INTERVAL_MS = 15_000;
const CALENDAR_INTERVAL_MS = 60_000;
const PRICE_INTERVAL_MS = 5 * 60_000;
const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const FEEDS = [
  { url: "https://investinglive.com/feed/news/" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
  { url: "https://feeds.bloomberg.com/markets/news.rss" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  { url: "https://www.forexlive.com/feed/news" },
  { url: "https://rss.politico.com/economy.xml", strict: true },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362", strict: true },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", strict: true },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml", strict: true },
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

// ─── Rule-based analytics fallback ───────────────────────────────────────────

const ANALYTICS_RULES = [
  {
    id: "china_weak",
    keywords: ["china", "chinese", "beijing", "caixin"],
    negKeywords: ["strong china", "china beats", "china surpasses"],
    sentimentNeg: ["weak", "miss", "slows", "decline", "falls", "contraction", "below", "disappoints", "cut", "stimulus", "slowdown"],
    impacts: [
      { asset: "🔶 Медь (HG)", dir: "↓", reason: "Китай — ~55% мирового спроса на медь; слабые данные давят на цену", reason_en: "China ~55% of global copper demand; weak data pressures price" },
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↓", reason: "Снижение промпроизводства → меньший спрос на энергоносители", reason_en: "Lower industrial output → reduced energy demand" },
      { asset: "🇦🇺 AUD/USD", dir: "↓", reason: "Австралия экспортирует железную руду и уголь в Китай", reason_en: "Australia exports iron ore and coal to China" },
      { asset: "🇳🇿 NZD/USD", dir: "↓", reason: "NZD коррелирует с риск-аппетитом и китайским спросом", reason_en: "NZD correlates with risk appetite and China demand" },
    ],
  },
  {
    id: "china_strong",
    keywords: ["china", "chinese", "beijing", "caixin"],
    negKeywords: [],
    sentimentPos: ["strong", "beats", "surges", "grows", "recovery", "above", "stimulus", "expansion", "record"],
    impacts: [
      { asset: "🔶 Медь (HG)", dir: "↑", reason: "Рост промпроизводства Китая → спрос на медь растёт", reason_en: "China industrial growth → copper demand rises" },
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "Восстановление экономики → рост потребления энергии", reason_en: "Economic recovery → higher energy consumption" },
      { asset: "🇦🇺 AUD/USD", dir: "↑", reason: "Позитив по Китаю поддерживает сырьевые экономики", reason_en: "China optimism supports commodity-linked economies" },
    ],
  },
  {
    id: "iran_conflict",
    keywords: ["iran", "hormuz", "strait of hormuz", "tehran", "persian gulf"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "~20% мировых поставок нефти идёт через Ормузский пролив", reason_en: "~20% of global oil supply transits Strait of Hormuz" },
      { asset: "🥇 Золото (XAU/USD)", dir: "↑", reason: "Геополитическая напряжённость → спрос на защитные активы", reason_en: "Geopolitical tension → safe-haven demand" },
      { asset: "💵 DXY (Доллар)", dir: "↑", reason: "Кризисный спрос на доллар как на резервную валюту", reason_en: "Crisis demand for dollar as reserve currency" },
    ],
  },
  {
    id: "red_sea",
    keywords: ["red sea", "houthi", "suez", "shipping", "tanker"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть (Brent)", dir: "↑", reason: "Перебои в транзите → дефицит предложения", reason_en: "Transit disruption → supply deficit" },
      { asset: "📦 Фрахт", dir: "↑", reason: "Суда вынуждены огибать Африку, логистика дорожает", reason_en: "Ships rerouting around Africa, freight costs surge" },
      { asset: "🌾 Пшеница / зерно", dir: "↑", reason: "Цепочки поставок зерна из Чёрного моря под угрозой", reason_en: "Black Sea grain supply chains at risk" },
    ],
  },
  {
    id: "russia_ukraine",
    keywords: ["russia", "ukraine", "kremlin", "moscow", "kyiv", "zelenskyy", "putin"],
    negKeywords: [],
    impacts: [
      { asset: "🌾 Пшеница / зерно", dir: "↑", reason: "РФ и Украина — ключевые экспортёры зерна (>25% мирового рынка)", reason_en: "Russia & Ukraine key grain exporters (>25% of global market)" },
      { asset: "🛢️ Нефть (Urals/Brent)", dir: "↑", reason: "Санкции на российскую нефть сокращают предложение", reason_en: "Sanctions on Russian oil reduce global supply" },
      { asset: "⚡ Природный газ (EU)", dir: "↑", reason: "Европа зависит от транзита российского газа", reason_en: "Europe dependent on Russian gas transit" },
      { asset: "🥇 Золото", dir: "↑", reason: "Геополитический риск → защитные активы", reason_en: "Geopolitical risk → safe-haven assets" },
      { asset: "🇪🇺 EUR/USD", dir: "↓", reason: "Европейская экономика страдает от энергетического кризиса", reason_en: "European economy hurt by energy crisis" },
    ],
  },
  {
    id: "sanctions",
    keywords: ["sanctions", "embargo", "banned", "blocked", "restricted"],
    negKeywords: [],
    impacts: [
      { asset: "🛢️ Нефть", dir: "↑", reason: "Санкции на нефтяные экономики сокращают глобальное предложение", reason_en: "Sanctions on oil economies reduce global supply" },
      { asset: "💵 DXY", dir: "↑", reason: "США контролируют санкционный инструмент — доллар укрепляется", reason_en: "US controls sanctions tool — dollar strengthens" },
      { asset: "🥇 Золото", dir: "↑", reason: "Страны под санкциями наращивают золотые резервы", reason_en: "Sanctioned countries accumulate gold reserves" },
    ],
  },
  {
    id: "war_conflict",
    keywords: ["war", "attack", "military", "troops", "airstrike", "invasion", "offensive"],
    negKeywords: ["trade war"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Классический защитный актив при геополитических кризисах", reason_en: "Classic safe-haven in geopolitical crises" },
      { asset: "💵 DXY", dir: "↑", reason: "Бегство в качество — доллар как резервная валюта", reason_en: "Flight to quality — dollar as reserve currency" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Риск нарушения цепочек поставок энергоносителей", reason_en: "Risk of energy supply chain disruption" },
    ],
  },
  {
    id: "nuclear",
    keywords: ["nuclear", "missile", "explosion", "blast"],
    negKeywords: ["nuclear plant"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Экстремальный риск → масштабное бегство в защитные активы", reason_en: "Extreme risk → massive safe-haven flight" },
      { asset: "💵 DXY + 🇨🇭 CHF", dir: "↑", reason: "Доллар и франк — главные активы-убежища при кризисах", reason_en: "Dollar and franc — top safe havens in crises" },
    ],
  },
  {
    id: "fed_hawkish",
    keywords: ["fed", "fomc", "federal reserve", "powell", "waller", "rate hike", "hawkish", "tightening"],
    negKeywords: ["rate cut", "dovish", "pause"],
    sentimentPos: ["hike", "hawkish", "tighten", "raise", "above expectations", "hot"],
    impacts: [
      { asset: "💵 DXY (Доллар)", dir: "↑", reason: "Повышение ставок → рост доходности → приток капитала в USD", reason_en: "Rate hike → rising yields → capital inflow to USD" },
      { asset: "🥇 Золото", dir: "↓", reason: "Высокие реальные ставки снижают привлекательность золота", reason_en: "High real rates reduce gold attractiveness" },
      { asset: "📉 Гособлигации (Treasuries)", dir: "↓", reason: "Рост ставок → падение цен облигаций", reason_en: "Rising rates → falling bond prices" },
      { asset: "🇯🇵 USD/JPY", dir: "↑", reason: "Расширение дифференциала ставок USD vs JPY", reason_en: "Widening rate differential USD vs JPY" },
    ],
  },
  {
    id: "fed_dovish",
    keywords: ["fed", "fomc", "federal reserve", "powell", "rate cut", "dovish", "pause", "easing"],
    negKeywords: ["rate hike", "hawkish"],
    sentimentPos: ["cut", "dovish", "pause", "ease", "lower", "below expectations"],
    impacts: [
      { asset: "💵 DXY (Доллар)", dir: "↓", reason: "Снижение ставок → ослабление доллара", reason_en: "Rate cut → dollar weakens" },
      { asset: "🥇 Золото", dir: "↑", reason: "Низкие реальные ставки поддерживают золото", reason_en: "Low real rates support gold" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Смягчение политики → рост аппетита к риску и спроса", reason_en: "Easing → higher risk appetite and demand" },
      { asset: "🥈 Серебро (XAG)", dir: "↑", reason: "Драгметаллы растут при ожиданиях мягкой политики", reason_en: "Precious metals rise on soft policy expectations" },
    ],
  },
  {
    id: "ecb_policy",
    keywords: ["ecb", "lagarde", "european central bank", "eurozone rate"],
    negKeywords: [],
    impacts: [
      { asset: "🇪🇺 EUR/USD", dir: "↑↓", reason: "Решение ЕЦБ напрямую определяет курс евро", reason_en: "ECB decision directly drives euro direction" },
      { asset: "📉 Европейские облигации", dir: "↑↓", reason: "Монетарная политика ЕЦБ управляет доходностью гособлигаций ЕС", reason_en: "ECB policy controls EU sovereign bond yields" },
      { asset: "🇬🇧 GBP/USD", dir: "↑↓", reason: "Изменения ЕЦБ влияют на GBP через торговые потоки ЕС/Великобритании", reason_en: "ECB shifts affect GBP via EU/UK trade flows" },
    ],
  },
  {
    id: "boj_policy",
    keywords: ["boj", "bank of japan", "ueda", "yield curve control", "ycc", "yen intervention"],
    negKeywords: [],
    impacts: [
      { asset: "🇯🇵 USD/JPY", dir: "↑↓", reason: "Политика BOJ критична для курса иены", reason_en: "BOJ policy critical for yen direction" },
      { asset: "🥇 Золото (в JPY)", dir: "↑↓", reason: "Ослабление иены увеличивает стоимость золота для японских инвесторов", reason_en: "Yen weakness raises gold cost for Japanese investors" },
    ],
  },
  {
    id: "inflation_hot",
    keywords: ["cpi", "pce", "inflation", "price index", "price pressures"],
    negKeywords: ["cooling", "falls", "eases", "softens", "lower than"],
    sentimentPos: ["hot", "above", "surges", "rises", "beats", "higher than expected", "accelerates"],
    impacts: [
      { asset: "💵 DXY", dir: "↑", reason: "Горячая инфляция → рынки ждут повышения ставок ФРС", reason_en: "Hot inflation → markets expect Fed rate hike" },
      { asset: "🥇 Золото", dir: "↑↓", reason: "Краткосрочно ↓ (ставки вверх), долгосрочно ↑ (хедж от инфляции)", reason_en: "Short-term ↓ (rates up), long-term ↑ (inflation hedge)" },
      { asset: "📉 Гособлигации", dir: "↓", reason: "Инфляция съедает доходность → продажи трежерис", reason_en: "Inflation erodes real yield → Treasury selling" },
      { asset: "🛢️ Нефть / сырьё", dir: "↑", reason: "Сырьё — традиционный хедж от инфляции", reason_en: "Commodities — traditional inflation hedge" },
    ],
  },
  {
    id: "inflation_cool",
    keywords: ["cpi", "pce", "inflation", "price index"],
    negKeywords: ["hot", "above", "surges", "beats", "higher than"],
    sentimentPos: ["cooling", "falls", "eases", "softens", "lower than expected", "slows"],
    impacts: [
      { asset: "💵 DXY", dir: "↓", reason: "Снижение инфляции → ожидания паузы/снижения ставок", reason_en: "Falling inflation → expectations of rate pause/cut" },
      { asset: "🥇 Золото", dir: "↑", reason: "Мягкая инфляция → ожидания снижения ставок поддерживают золото", reason_en: "Soft inflation → rate cut expectations support gold" },
      { asset: "📈 Гособлигации", dir: "↑", reason: "Охлаждение инфляции → рост цен облигаций", reason_en: "Cooling inflation → bond price rally" },
    ],
  },
  {
    id: "nfp_strong",
    keywords: ["nfp", "nonfarm", "payroll", "jobs", "employment", "unemployment"],
    negKeywords: [],
    sentimentPos: ["beats", "surges", "strong", "above", "better than expected", "added"],
    impacts: [
      { asset: "💵 DXY", dir: "↑", reason: "Сильный рынок труда → ФРС может держать высокие ставки дольше", reason_en: "Strong labor market → Fed can hold rates higher for longer" },
      { asset: "🥇 Золото", dir: "↓", reason: "Снижается вероятность смягчения политики ФРС", reason_en: "Lower probability of Fed easing reduces gold appeal" },
      { asset: "📉 Гособлигации", dir: "↓", reason: "Доходность растёт на ожиданиях удержания ставок", reason_en: "Yields rise on rate-hold expectations" },
      { asset: "🇯🇵 USD/JPY", dir: "↑", reason: "Сильный USD давит иену при расхождении ДКП", reason_en: "Strong USD pushes yen lower on policy divergence" },
    ],
  },
  {
    id: "nfp_weak",
    keywords: ["nfp", "nonfarm", "payroll", "jobs", "employment", "unemployment"],
    negKeywords: [],
    sentimentPos: ["misses", "weak", "below", "falls", "disappoints", "fewer than expected"],
    impacts: [
      { asset: "💵 DXY", dir: "↓", reason: "Слабый рынок труда → ФРС может раньше снизить ставки", reason_en: "Weak labor market → Fed may cut rates sooner" },
      { asset: "🥇 Золото", dir: "↑", reason: "Ожидания смягчения монетарной политики поддерживают золото", reason_en: "Easing expectations boost gold" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Слабый рынок труда → замедление экономики → снижение спроса", reason_en: "Weak labor → economic slowdown → lower energy demand" },
    ],
  },
  {
    id: "gdp_strong",
    keywords: ["gdp", "gross domestic product", "economic growth"],
    negKeywords: [],
    sentimentPos: ["beats", "strong", "above", "accelerates", "record"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↑", reason: "Сильный ВВП укрепляет национальную валюту", reason_en: "Strong GDP strengthens national currency" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Рост экономики → рост потребления энергии", reason_en: "Economic growth → higher energy consumption" },
    ],
  },
  {
    id: "gdp_weak",
    keywords: ["gdp", "gross domestic product", "economic growth", "recession"],
    negKeywords: [],
    sentimentPos: ["falls", "contraction", "misses", "weak", "recession", "shrinks", "negative"],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Рецессионные риски → защитные активы растут", reason_en: "Recession risks → safe-haven assets rise" },
      { asset: "💵 DXY", dir: "↑↓", reason: "Зависит от страны: рецессия в США → USD ↓, в других → USD ↑", reason_en: "Depends on country: US recession → USD ↓, elsewhere → USD ↑" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Замедление экономики → снижение спроса на энергоносители", reason_en: "Economic slowdown → lower energy demand" },
    ],
  },
  {
    id: "trade_war",
    keywords: ["tariff", "tariffs", "trade war", "trade deal", "import duty", "trade dispute", "wto"],
    negKeywords: [],
    impacts: [
      { asset: "🔶 Медь / Сталь / Алюминий", dir: "↑↓", reason: "Тарифы прямо влияют на металлы через цепочки поставок", reason_en: "Tariffs directly hit metals through supply chains" },
      { asset: "🌾 Соя / с/х товары", dir: "↑↓", reason: "Торговые войны затрагивают сельхозэкспорт", reason_en: "Trade wars disrupt agricultural exports" },
      { asset: "🇨🇳 CNY / 🇦🇺 AUD", dir: "↓", reason: "Страны-экспортёры страдают при торговой напряжённости", reason_en: "Exporter nations suffer under trade tensions" },
      { asset: "🥇 Золото", dir: "↑", reason: "Неопределённость → защитные активы", reason_en: "Uncertainty → safe-haven assets" },
    ],
  },
  {
    id: "opec_cut",
    keywords: ["opec", "opec+", "production cut", "output cut", "saudi aramco", "saudi arabia"],
    negKeywords: ["production increase", "output increase", "raises output"],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↑", reason: "Сокращение добычи → дефицит предложения → рост цен", reason_en: "Production cut → supply deficit → price rise" },
      { asset: "🇨🇦 CAD/USD", dir: "↑", reason: "Канада — крупный нефтеэкспортёр; нефть поддерживает CAD", reason_en: "Canada major oil exporter; oil prices support CAD" },
      { asset: "🇳🇴 NOK (норвежская крона)", dir: "↑", reason: "Норвегия — ключевой нефтяной экспортёр в Европе", reason_en: "Norway key oil exporter in Europe" },
    ],
  },
  {
    id: "opec_raise",
    keywords: ["opec", "opec+", "production increase", "output increase", "raises output"],
    negKeywords: ["production cut", "output cut"],
    impacts: [
      { asset: "🛢️ Нефть (WTI/Brent)", dir: "↓", reason: "Рост добычи → увеличение предложения → давление на цены", reason_en: "Output increase → supply glut → price pressure" },
      { asset: "🇨🇦 CAD", dir: "↓", reason: "Нефтяная выручка Канады сокращается при падении цен", reason_en: "Canada oil revenue falls with lower prices" },
    ],
  },
  {
    id: "eia_drawdown",
    keywords: ["eia", "crude inventories", "oil inventories", "crude draw", "stockpiles"],
    negKeywords: [],
    sentimentPos: ["draw", "decline", "fell", "less than expected", "deficit"],
    impacts: [
      { asset: "🛢️ Нефть (WTI)", dir: "↑", reason: "Снижение запасов сигнализирует о сильном спросе или дефиците", reason_en: "Inventory draw signals strong demand or supply deficit" },
    ],
  },
  {
    id: "eia_build",
    keywords: ["eia", "crude inventories", "oil inventories", "crude build", "stockpiles"],
    negKeywords: [],
    sentimentPos: ["build", "rise", "gain", "more than expected", "surplus", "increase"],
    impacts: [
      { asset: "🛢️ Нефть (WTI)", dir: "↓", reason: "Рост запасов → избыток предложения давит на цены", reason_en: "Inventory build → oversupply pressures prices" },
    ],
  },
  {
    id: "gold_demand",
    keywords: ["gold", "xau", "bullion", "central bank gold", "gold reserves"],
    negKeywords: [],
    sentimentPos: ["buys", "purchases", "adds", "increases", "record", "demand"],
    impacts: [
      { asset: "🥇 Золото (XAU/USD)", dir: "↑", reason: "Рост спроса от ЦБ или инвесторов поддерживает золото", reason_en: "Rising central bank or investor demand supports gold" },
      { asset: "🥈 Серебро (XAG/USD)", dir: "↑", reason: "Серебро коррелирует с золотом как защитный металл", reason_en: "Silver correlates with gold as a precious metal" },
    ],
  },
  {
    id: "dollar_strong",
    keywords: ["dollar", "usd", "dxy", "dollar index"],
    negKeywords: [],
    sentimentPos: ["surges", "rallies", "rises", "strengthens", "gains", "highs"],
    impacts: [
      { asset: "🥇 Золото", dir: "↓", reason: "Сильный доллар делает золото дороже для нерезидентов", reason_en: "Strong dollar makes gold more expensive for non-US buyers" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Нефть торгуется в USD — сильный доллар давит на цену", reason_en: "Oil priced in USD — strong dollar pressures price" },
      { asset: "🌍 EM-валюты", dir: "↓", reason: "Крепкий доллар ужесточает условия для развивающихся рынков", reason_en: "Strong dollar tightens financial conditions for EM" },
    ],
  },
  {
    id: "recession",
    keywords: ["recession", "bank run", "credit crunch", "financial crisis", "default", "collapse", "lehman"],
    negKeywords: [],
    impacts: [
      { asset: "🥇 Золото", dir: "↑", reason: "Глубокий кризис → исторически максимальный спрос на золото", reason_en: "Deep crisis → historically maximum gold demand" },
      { asset: "💵 DXY", dir: "↑", reason: "Долларовый дефицит при кризисе → краткосрочный рост USD", reason_en: "Dollar squeeze in crisis → short-term USD strength" },
      { asset: "🛢️ Нефть", dir: "↓", reason: "Рецессия → сокращение промышленного потребления энергии", reason_en: "Recession → lower industrial energy consumption" },
    ],
  },
  {
    id: "pmi_strong",
    keywords: ["pmi", "manufacturing", "services", "business activity", "ifo", "zew"],
    negKeywords: [],
    sentimentPos: ["beats", "above 50", "expansion", "improves", "rises", "record"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↑", reason: "PMI выше 50 → экономика расширяется → валюта укрепляется", reason_en: "PMI above 50 → economy expanding → currency strengthens" },
      { asset: "🛢️ Нефть", dir: "↑", reason: "Рост производства → рост потребления энергии", reason_en: "Manufacturing growth → higher energy demand" },
    ],
  },
  {
    id: "pmi_weak",
    keywords: ["pmi", "manufacturing", "services", "business activity", "ifo", "zew"],
    negKeywords: [],
    sentimentPos: ["misses", "below 50", "contraction", "falls", "weakens", "slowdown"],
    impacts: [
      { asset: "💵 Нацвалюта страны", dir: "↓", reason: "PMI ниже 50 → экономика сжимается → валюта слабеет", reason_en: "PMI below 50 → economy contracting → currency weakens" },
      { asset: "🥇 Золото", dir: "↑", reason: "Слабые данные → ожидания смягчения ЦБ → золото растёт", reason_en: "Weak data → central bank easing expectations → gold rises" },
    ],
  },
  {
    id: "trump_tariffs",
    keywords: ["trump", "tariff", "white house", "executive order"],
    negKeywords: [],
    impacts: [
      { asset: "💵 DXY", dir: "↑↓", reason: "Протекционизм краткосрочно поддерживает USD, но создаёт риски", reason_en: "Protectionism short-term supports USD but creates volatility" },
      { asset: "🥇 Золото", dir: "↑", reason: "Неопределённость торговой политики → защитные активы", reason_en: "Trade policy uncertainty → safe-haven assets" },
      { asset: "🇨🇳 CNY / EM-валюты", dir: "↓", reason: "Тарифы наиболее болезненны для экспортёров в США", reason_en: "Tariffs most painful for US-export dependent economies" },
    ],
  },
  {
    id: "natgas",
    keywords: ["natural gas", "lng", "gas pipeline", "gas supply", "nordstream", "ttf", "henry hub"],
    negKeywords: [],
    impacts: [
      { asset: "⚡ Природный газ (TTF/HH)", dir: "↑↓", reason: "Перебои в поставках или данные о запасах двигают цену газа", reason_en: "Supply disruptions or inventory data move gas prices" },
      { asset: "🇪🇺 EUR/USD", dir: "↓", reason: "Дорогой газ повышает энергозатраты европейской промышленности", reason_en: "Expensive gas raises energy costs for European industry" },
    ],
  },
  {
    id: "yen_intervention",
    keywords: ["yen", "jpy", "intervention", "mof japan", "boj intervention"],
    negKeywords: [],
    impacts: [
      { asset: "🇯🇵 USD/JPY", dir: "↑↓", reason: "Прямая интервенция BOJ/MoF способна резко двинуть иену", reason_en: "Direct BOJ/MoF intervention can sharply move the yen" },
      { asset: "🥇 Золото (в JPY)", dir: "↑↓", reason: "Движения иены меняют локальную стоимость золота", reason_en: "Yen moves change local gold price for Japanese investors" },
    ],
  },
];

// ─── Sentiment helpers ────────────────────────────────────────────────────────

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

// ─── Gemini Analytics ─────────────────────────────────────────────────────────
// Returns { ruBlock, enBlock } or null on failure

async function generateLLMAnalytics(titleEn, descEn) {
  if (!process.env.GEMINI_API_KEY) return null;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a senior macro analyst with deep knowledge of global trade flows, commodity markets, and geopolitics. Analyze this news with precise, data-driven context.

News:
"""
${titleEn}

${descEn}
"""

STEP 1 — CONTEXT EXTRACTION (think before answering):
- What country/region/chokepoint is involved? What is its SPECIFIC quantitative role in global markets?
  Examples:
  • If a country produces oil → state its approximate % of global oil production or OPEC+ share
  • If a chokepoint (strait, canal, port) → state % of global trade/energy that transits through it
  • If a central bank acts → state size of economy, currency's weight in DXY or global reserves
  • If an agricultural country → state its % of global exports for the relevant commodity
  • If a metal producer → state its % of global mine supply
  Use your training knowledge to provide APPROXIMATE but REALISTIC figures.
  If genuinely uncertain, give a range (e.g. "~15-20%").

STEP 2 — MARKET IMPACT:
Analyze ALL genuinely affected assets from:
- Forex: major pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, USD/NOK, USD/SEK) and relevant crosses
- Precious metals: Gold (XAU/USD), Silver (XAG/USD), Platinum, Palladium
- Energy: WTI Crude, Brent Crude, Natural Gas (TTF, Henry Hub)
- Industrial metals: Copper (HG), Aluminum, Steel
- Agricultural commodities: Wheat, Corn, Soybeans (only if genuinely affected)
- Bonds/Rates: US Treasuries, German Bunds, UK Gilts (if relevant)

Rules:
- Include ONLY assets that are DIRECTLY and MATERIALLY affected — minimum 4, maximum 8 impacts
- Do NOT include crypto or stock indices
- reason_ru and reason_en MUST contain specific quantitative context from Step 1 where relevant
  ✓ GOOD: "Иран — ~4% мировой нефти, риск блокады Ормуза (+20%)"
  ✓ GOOD: "Cuba produces ~7% of global nickel supply, prices spike"
  ✗ BAD: "geopolitical tension affects oil prices" (too generic)

Respond with ONLY valid JSON, no extra text:

{
  "context": "1-2 sentences summarizing the key quantitative facts about the actor/region in this news",
  "context_ru": "То же самое на русском — ключевые цифры по стране/региону из новости",
  "impacts": [
    {
      "asset_ru": "Название актива с эмодзи на русском",
      "asset_en": "Asset name with emoji in English",
      "direction": "↑ or ↓ or ↑↓",
      "strength": "high or medium or low",
      "reason_ru": "Конкретное объяснение с цифрами на русском (макс 15 слов)",
      "reason_en": "Specific explanation with figures in English (max 15 words)"
    }
  ],
  "summary_ru": "Общий вывод с ключевыми цифрами на русском (1-2 предложения)",
  "summary_en": "Overall conclusion with key figures in English (1-2 sentences)",
  "sentiment": "bullish or bearish or neutral"
}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    text = text.slice(jsonStart, jsonEnd + 1);

    const analysis = JSON.parse(text);
    if (!analysis.impacts || analysis.impacts.length === 0) return null;

    // Build Russian block for Telegram (with dynamic context line)
    // Count high-strength impacts to detect macro shock
    const highCount = analysis.impacts.filter((i) => i.strength === "high").length;
    const isShock   = highCount >= 3;

    const ruLines = analysis.impacts.slice(0, 7).map((imp) =>
      `  ${imp.direction} *${imp.asset_ru}* — _${imp.reason_ru}_`
    );
    const contextLine = analysis.context_ru ? `🌍 _${analysis.context_ru}_\n\n` : "";
    const shockBadgeRu = isShock ? `🚨 *MACRO SHOCK* — множественный удар по рынкам\n\n` : "";
    const ruBlock =
      `📊 *Аналитика Gemini:*\n${shockBadgeRu}${contextLine}${ruLines.join("\n")}` +
      (analysis.summary_ru ? `\n\n💡 ${analysis.summary_ru}` : "");

    // Build English block for X (with dynamic context)
    const enLines = analysis.impacts.slice(0, 6).map((imp) =>
      `${imp.direction} ${imp.asset_en} — ${imp.reason_en}`
    );
    const enContextLine = analysis.context ? `🌍 ${analysis.context}\n` : "";
    const shockBadgeEn = isShock ? `🚨 MACRO SHOCK — broad multi-asset impact\n` : "";
    const enBlock =
      `📊 Analysis:\n${shockBadgeEn}${enContextLine}${enLines.join("\n")}` +
      (analysis.summary_en ? `\n💡 ${analysis.summary_en}` : "");

    return { ruBlock, enBlock, sentiment: analysis.sentiment, isShock };
  } catch (err) {
    console.error("[Gemini] Error:", err.message);
    return null;
  }
}

// Normalise asset name for deduplication — strip emojis, punctuation, lowercase
function normaliseAsset(name) {
  return name
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 20); // first 20 chars enough for uniqueness
}

// Translate Russian asset name fragments to English for X posts
const RU_ASSET_TO_EN = {
  "Медь": "Copper",
  "Нефть": "Oil",
  "Природный газ": "Natural Gas",
  "Золото": "Gold",
  "Серебро": "Silver",
  "Платина": "Platinum",
  "Палладий": "Palladium",
  "Пшеница / зерно": "Wheat",
  "Пшеница": "Wheat",
  "Кукуруза": "Corn",
  "Соя": "Soybeans",
  "Фрахт": "Freight",
  "Гособлигации (Treasuries)": "Treasuries",
  "Гособлигации": "Gov Bonds",
  "Европейские облигации": "EU Bonds",
  "EM-валюты": "EM Currencies",
  "Нацвалюта страны": "National Currency",
  "Доллар": "Dollar",
};

function assetNameToEn(asset) {
  for (const [ru, en] of Object.entries(RU_ASSET_TO_EN)) {
    if (asset.includes(ru)) return asset.replace(ru, en);
  }
  return asset;
}

// Fallback: rule-based, returns { ruBlock, enBlock }
function generateRuleBasedAnalytics(titleEn, descEn) {
  const text = `${titleEn} ${descEn}`.toLowerCase();
  const matchedImpacts = [];
  const seenAssets = new Set();

  for (const rule of ANALYTICS_RULES) {
    if (!matchesRule(rule, text)) continue;
    for (const impact of rule.impacts) {
      const normKey = normaliseAsset(impact.asset);
      if (seenAssets.has(normKey)) continue;
      seenAssets.add(normKey);
      matchedImpacts.push(impact);
    }
  }

  if (matchedImpacts.length === 0) return null;

  const top = matchedImpacts.slice(0, 6);
  const ruLines = top.map((imp) => `  ${imp.dir} *${imp.asset}* — _${imp.reason}_`);
  const enLines = top.map((imp) => `${imp.dir} ${assetNameToEn(imp.asset)} — ${imp.reason_en || imp.reason}`);

  return {
    ruBlock: `📊 *Аналитика:*\n${ruLines.join("\n")}`,
    enBlock: `📊 Analysis:\n${enLines.join("\n")}`,
  };
}

// Main analytics entry point — Gemini first, rule-based fallback
async function generateAnalytics(titleEn, descEn) {
  const llm = await generateLLMAnalytics(titleEn, descEn);
  if (llm) return llm;

  console.log("[Analytics] Gemini failed, using rule-based fallback");
  return generateRuleBasedAnalytics(titleEn, descEn);
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

// ─── Translation (Google Translate only) ─────────────────────────────────────

async function translateToRussian(text) {
  if (!text || !text.trim()) return "";

  for (const clientId of ["gtx", "dict-chrome-ex"]) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=${clientId}&sl=en&tl=ru&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const translated = data[0].map((s) => s[0]).join("").trim();
        if (translated) return translated;
      }
    } catch { /* continue */ }
  }

  return text; // last resort: original
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
    sendToChat(TELEGRAM_CHANNEL, text),
  ]);
}

// ─── X (Twitter) posting ──────────────────────────────────────────────────────

const X_API_KEY             = process.env.X_API_KEY;
const X_API_SECRET          = process.env.X_API_SECRET;
const X_ACCESS_TOKEN        = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const enc = (s) => encodeURIComponent(String(s));
  const base = method.toUpperCase() + "&" + enc(url) + "&" +
    enc(Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&"));
  const key = enc(consumerSecret) + "&" + enc(tokenSecret);
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

function buildOAuthHeader(method, url, extraBody = {}) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts    = String(Math.floor(Date.now() / 1000));

  const oauthParams = {
    oauth_consumer_key:     X_API_KEY,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        ts,
    oauth_token:            X_ACCESS_TOKEN,
    oauth_version:          "1.0",
  };

  // Signature is over oauth params only (body is JSON, not form-encoded)
  oauthParams.oauth_signature = oauthSign(
    method, url, oauthParams, X_API_SECRET, X_ACCESS_TOKEN_SECRET
  );

  return "OAuth " + Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ");
}

// Post a single tweet. Returns tweet ID or null.
async function postSingleTweet(text, replyToId = null) {
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    console.error("[X] ❌ КЛЮЧИ НЕ НАСТРОЕНЫ — проверь переменные окружения:");
    console.error(`    X_API_KEY:             ${X_API_KEY             ? "✅ есть" : "❌ ОТСУТСТВУЕТ"}`);
    console.error(`    X_API_SECRET:          ${X_API_SECRET          ? "✅ есть" : "❌ ОТСУТСТВУЕТ"}`);
    console.error(`    X_ACCESS_TOKEN:        ${X_ACCESS_TOKEN        ? "✅ есть" : "❌ ОТСУТСТВУЕТ"}`);
    console.error(`    X_ACCESS_TOKEN_SECRET: ${X_ACCESS_TOKEN_SECRET ? "✅ есть" : "❌ ОТСУТСТВУЕТ"}`);
    return null;
  }
  try {
    const apiUrl = "https://api.twitter.com/2/tweets";
    const body   = replyToId
      ? { text, reply: { in_reply_to_tweet_id: replyToId } }
      : { text };

    console.log(`[X] Отправка твита (${text.length} chars)...`);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": buildOAuthHeader("POST", apiUrl),
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();

    if (res.ok) {
      let data;
      try { data = JSON.parse(responseText); } catch { data = {}; }
      const id = data?.data?.id ?? null;
      console.log(`[${new Date().toISOString()}] [X] ✅ Твит опубликован: ${id}`);
      return id;
    } else {
      console.error(`[X] ❌ Ошибка HTTP ${res.status}: ${responseText}`);
      if (res.status === 403) {
        console.error("[X] 403 = у приложения нет прав на запись. Проверь: developer.twitter.com → App Settings → App permissions → Read and Write");
      } else if (res.status === 401) {
        console.error("[X] 401 = неверные ключи или токены. Перегенерируй Access Token в developer portal.");
      } else if (res.status === 429) {
        console.error("[X] 429 = превышен лимит запросов. Подожди и попробуй снова.");
      }
      return null;
    }
  } catch (err) {
    console.error("[X] ❌ Сетевая ошибка:", err.message);
    return null;
  }
}

// Post two-tweet thread: tweet1 = news, tweet2 = analytics reply
async function postToX(titleEn, cleanDesc, enAnalyticsBlock, link, vip, isShock = false) {
  const tag = isShock ? "🚨 MACRO SHOCK" : vip ? "🔴 BREAKING" : "⚡ MACRO";

  // ── Tweet 1: News ─────────────────────────────────────────────────────────
  const linkSuffix = `\n\n🔗 ${link}`;
  const maxBody    = 280 - linkSuffix.length;

  let tweet1Body = `${tag}\n\n📌 ${titleEn}`;

  // Try to append description if it fits
  if (cleanDesc) {
    const shortDesc = cleanDesc.length > 120 ? cleanDesc.slice(0, 117) + "…" : cleanDesc;
    const withDesc  = `${tweet1Body}\n\n${shortDesc}`;
    tweet1Body = withDesc.length <= maxBody ? withDesc : tweet1Body;
  }

  // If title alone is still too long, truncate
  if (tweet1Body.length > maxBody) {
    tweet1Body = tweet1Body.slice(0, maxBody - 1) + "…";
  }

  const tweet1 = tweet1Body + linkSuffix;

  const tweet1Id = await postSingleTweet(tweet1);

  // ── Tweet 2: Analytics reply ───────────────────────────────────────────────
  if (tweet1Id && enAnalyticsBlock) {
    // Strip markdown from analytics for X
    const cleanAnalytics = enAnalyticsBlock
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g,   "$1")
      .trim();

    // Truncate analytics to 280 chars
    const tweet2 = cleanAnalytics.length > 280
      ? cleanAnalytics.slice(0, 277) + "…"
      : cleanAnalytics;

    await postSingleTweet(tweet2, tweet1Id);
  }
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

      const shortDesc     = cleanDesc.length > 300 ? cleanDesc.slice(0, 300) + "…" : cleanDesc;

      // Translate title and description to Russian for Telegram
      const [titleRu, descRu] = await Promise.all([
        translateToRussian(titleEn),
        translateToRussian(shortDesc),
      ]);

      const vip             = isVip(fullText);
      const header          = vip ? "🔴 *News Craig Breaking*" : "⚡️ *News Craig Macro*";
      const descBlock       = descRu ? `📝 ${descRu}\n\n` : "";

      const analytics = await generateAnalytics(titleEn, cleanDesc);

      // ── Telegram message — all in Russian ────────────────────────────────
      const analyticsSection = analytics?.ruBlock ? `\n\n${analytics.ruBlock}` : "";
      const message = (
        `${header}\n\n` +
        `📌 *${titleRu}*\n\n` +
        `${descBlock}` +
        `${analyticsSection}\n\n` +
        `🔗 [Источник](${link})`
      ).slice(0, 4096);

      await sendTelegram(message);

      // ── X — English thread ────────────────────────────────────────────────
      await postToX(titleEn, cleanDesc, analytics?.enBlock ?? null, link, vip, analytics?.isShock ?? false);

      // ── Market reaction engine — только для VIP и MACRO SHOCK ─────────────
      if (vip || analytics?.isShock) {
        const snapshot = await captureSnapshot();
        scheduleMarketReaction(snapshot, titleRu);
      }

      console.log(`[${new Date().toISOString()}] [${vip ? "VIP" : "STD"}]${analytics ? " [ANALYTICS]" : ""} ${titleEn}`);

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
      const titleRu   = await translateToRussian(event.title);
      const analytics = await generateAnalytics(event.title, event.title);
      const analyticsSection = analytics?.ruBlock ? `\n\n${analytics.ruBlock}` : "";

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
    console.error("[Calendar] Error:", err.message);
  }
}

// ─── Market reaction engine ───────────────────────────────────────────────────
// После VIP/MACRO SHOCK новости снимаем снепшот цен и через 1 и 5 минут
// сравниваем — рынок подтвердил или проигнорировал новость?

const REACTION_ASSETS = [
  { symbol: "DX-Y.NYB", label: "DXY",     emoji: "💵", threshold: 0.10,   decimals: 2, unit: "pts" },
  { symbol: "GC=F",     label: "Золото",  emoji: "🥇", threshold: 5,      decimals: 0, unit: "$"   },
  { symbol: "BZ=F",     label: "Brent",   emoji: "🛢️", threshold: 0.40,   decimals: 1, unit: "$"   },
  { symbol: "EURUSD=X", label: "EUR/USD", emoji: "🇪🇺", threshold: 0.0015, decimals: 4, unit: ""    },
  { symbol: "JPY=X",    label: "USD/JPY", emoji: "🇯🇵", threshold: 0.15,   decimals: 2, unit: "¥"   },
  { symbol: "^TNX",     label: "US10Y",   emoji: "📉", threshold: 0.02,   decimals: 2, unit: "%"   },
  { symbol: "SI=F",     label: "Серебро", emoji: "🥈", threshold: 0.20,   decimals: 2, unit: "$"   },
];

async function captureSnapshot() {
  const snapshot = {};
  for (const asset of REACTION_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price !== null) snapshot[asset.symbol] = price;
  }
  return snapshot;
}

async function sendMarketReaction(snapshot, titleRu, delayLabel) {
  const moves = [];
  for (const asset of REACTION_ASSETS) {
    const before = snapshot[asset.symbol];
    if (before == null) continue;
    const after = await fetchPrice(asset.symbol);
    if (after == null) continue;
    const delta    = after - before;
    const absDelta = Math.abs(delta);
    if (absDelta < asset.threshold) continue;
    const dir  = delta > 0 ? "↑" : "↓";
    const sign = delta > 0 ? "+" : "";
    moves.push(`${asset.emoji} *${asset.label}*: ${dir} ${sign}${delta.toFixed(asset.decimals)}${asset.unit ? " " + asset.unit : ""}`);
  }

  if (moves.length === 0) return; // рынок не отреагировал значимо — молчим

  const verdict = moves.length >= 3
    ? "✅ Рынок *подтверждает* реакцию на новость"
    : "⚠️ Рынок реагирует *частично*";

  await sendTelegram(
    `📡 *Реакция рынка (${delayLabel})*\n` +
    `_${titleRu}_\n\n` +
    moves.join("\n") + "\n\n" +
    verdict
  );
}

function scheduleMarketReaction(snapshot, titleRu) {
  setTimeout(() => sendMarketReaction(snapshot, titleRu, "+1 мин").catch(() => {}),  1 * 60_000);
  setTimeout(() => sendMarketReaction(snapshot, titleRu, "+5 мин").catch(() => {}),  5 * 60_000);
}

// ─── Price alerts ─────────────────────────────────────────────────────────────

// Минимальный интервал между алертами по одному активу (30 минут)
// Защищает от флуда когда цена болтается вокруг уровня
const PRICE_ALERT_COOLDOWN_MS = 30 * 60_000;

const PRICE_ASSETS = [
  // ── Драгоценные металлы ──────────────────────────────────────────────────
  { symbol: "GC=F",      label: "Золото (XAU/USD)",          emoji: "🥇", unit: "$",   roundTo: 100,   decimals: 0, lastLevel: null, lastAlertTime: null },
  { symbol: "SI=F",      label: "Серебро (XAG/USD)",         emoji: "🥈", unit: "$",   roundTo: 1,     decimals: 2, lastLevel: null, lastAlertTime: null },
  { symbol: "PL=F",      label: "Платина (XPT/USD)",         emoji: "⬜", unit: "$",   roundTo: 50,    decimals: 0, lastLevel: null, lastAlertTime: null },
  { symbol: "PA=F",      label: "Палладий (XPD/USD)",        emoji: "🔘", unit: "$",   roundTo: 100,   decimals: 0, lastLevel: null, lastAlertTime: null },
  // ── Энергетика ───────────────────────────────────────────────────────────
  { symbol: "CL=F",      label: "Нефть WTI",                 emoji: "🛢️", unit: "$",   roundTo: 5,     decimals: 1, lastLevel: null, lastAlertTime: null },
  { symbol: "BZ=F",      label: "Нефть Brent",               emoji: "⛽",  unit: "$",   roundTo: 5,     decimals: 1, lastLevel: null, lastAlertTime: null },
  { symbol: "NG=F",      label: "Природный газ (Henry Hub)", emoji: "⚡", unit: "$",   roundTo: 0.25,  decimals: 2, lastLevel: null, lastAlertTime: null },
  // ── Промышленные металлы ─────────────────────────────────────────────────
  { symbol: "HG=F",      label: "Медь (HG)",                 emoji: "🔶", unit: "$",   roundTo: 0.25,  decimals: 2, lastLevel: null, lastAlertTime: null },
  // ── Сельхоз товары ───────────────────────────────────────────────────────
  { symbol: "ZW=F",      label: "Пшеница",                   emoji: "🌾", unit: "¢",   roundTo: 25,    decimals: 0, lastLevel: null, lastAlertTime: null },
  { symbol: "ZC=F",      label: "Кукуруза",                  emoji: "🌽", unit: "¢",   roundTo: 25,    decimals: 0, lastLevel: null, lastAlertTime: null },
  { symbol: "ZS=F",      label: "Соя",                       emoji: "🫘", unit: "¢",   roundTo: 50,    decimals: 0, lastLevel: null, lastAlertTime: null },
  // ── Форекс ───────────────────────────────────────────────────────────────
  { symbol: "DX-Y.NYB",  label: "Индекс доллара (DXY)",      emoji: "💵", unit: "pts", roundTo: 1,     decimals: 2, lastLevel: null, lastAlertTime: null },
  { symbol: "EURUSD=X",  label: "EUR/USD",                   emoji: "🇪🇺", unit: "",   roundTo: 0.005, decimals: 4, lastLevel: null, lastAlertTime: null },
  { symbol: "GBPUSD=X",  label: "GBP/USD",                   emoji: "🇬🇧", unit: "",   roundTo: 0.005, decimals: 4, lastLevel: null, lastAlertTime: null },
  { symbol: "JPY=X",     label: "USD/JPY",                   emoji: "🇯🇵", unit: "¥",  roundTo: 1,     decimals: 2, lastLevel: null, lastAlertTime: null },
  { symbol: "AUDUSD=X",  label: "AUD/USD",                   emoji: "🇦🇺", unit: "",   roundTo: 0.005, decimals: 4, lastLevel: null, lastAlertTime: null },
  { symbol: "CADUSD=X",  label: "USD/CAD",                   emoji: "🇨🇦", unit: "",   roundTo: 0.005, decimals: 4, lastLevel: null, lastAlertTime: null },
  // ── Облигации ────────────────────────────────────────────────────────────
  { symbol: "^TNX",      label: "US 10Y Yield",              emoji: "📉", unit: "%",   roundTo: 0.25,  decimals: 2, lastLevel: null, lastAlertTime: null },
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

function getFloorLevel(price, roundTo) {
  const factor = Math.round(1 / roundTo * 1e8) / 1e8;
  return Math.floor(Math.round(price * factor * 1e6) / 1e6) / factor;
}

async function initPriceLevels() {
  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;
    asset.lastLevel = getFloorLevel(price, asset.roundTo);
    console.log(`[PRICE INIT] ${asset.label}: ${price.toFixed(asset.decimals)} ${asset.unit} → level ${asset.lastLevel}`);
  }
}

async function checkPriceAlerts() {
  const now = Date.now();

  for (const asset of PRICE_ASSETS) {
    const price = await fetchPrice(asset.symbol);
    if (price === null) continue;

    const currentLevel = getFloorLevel(price, asset.roundTo);

    // Первый запуск — просто запоминаем уровень
    if (asset.lastLevel === null) {
      asset.lastLevel = currentLevel;
      continue;
    }

    if (currentLevel === asset.lastLevel) continue;

    // Кулдаун: если алерт по этому активу уже отправлялся недавно — молчим.
    // Это предотвращает флуд когда цена болтается вокруг одного уровня.
    if (asset.lastAlertTime !== null && now - asset.lastAlertTime < PRICE_ALERT_COOLDOWN_MS) {
      asset.lastLevel = currentLevel; // обновляем уровень но не шлём
      continue;
    }

    const dir      = currentLevel > asset.lastLevel ? "📈 РОСТ" : "📉 ПАДЕНИЕ";
    const dirArrow = currentLevel > asset.lastLevel ? "↑" : "↓";
    const prevLevel = asset.lastLevel;

    asset.lastLevel     = currentLevel;
    asset.lastAlertTime = now;

    await sendTelegram(
      `${asset.emoji} *ЦЕНОВОЙ АЛЕРТ | ${asset.label}*\n\n` +
      `${dir} через уровень *${currentLevel.toFixed(asset.decimals)} ${asset.unit}*\n` +
      `${dirArrow} Предыдущий уровень: ${prevLevel.toFixed(asset.decimals)} ${asset.unit}\n` +
      `💰 Текущая цена: ~${price.toFixed(asset.decimals)} ${asset.unit}`
    );
    console.log(`[PRICE ALERT] ${asset.label}: ${prevLevel} → ${currentLevel}`);
  }
}

// ─── Session alerts ───────────────────────────────────────────────────────────

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
  const curTotalMin  = curH * 60 + curM;
  const openTotalMin = session.openHour * 60 + session.openMinute;
  const diffMs       = (openTotalMin - curTotalMin) * 60_000;
  const openUtcMs    = probe.getTime() + diffMs;
  return new Date(openUtcMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
}

async function checkSessionAlerts() {
  const nowDateKey = currentMoscowDateKey();
  const { hour: currentHour, minute: currentMinute } = getLocalHHMM("Europe/Moscow");

  for (const session of SESSIONS) {
    const warn = sessionWarnHHMM(session);
    if (currentHour !== warn.hour || currentMinute !== warn.minute) continue;
    if (new Date().getSeconds() >= 50) continue;

    const alertKey = `${session.name}|${nowDateKey}|${warn.hour}:${warn.minute}`;
    if (sentSessionAlerts.has(alertKey)) continue;
    sentSessionAlerts.add(alertKey);

    const openTimeMsk   = sessionOpenTimeMoscow(session);
    const openTimeLocal = `${String(session.openHour).padStart(2, "0")}:${String(session.openMinute).padStart(2, "0")}`;

    await sendTelegram(
      `🔔 *ОТКРЫТИЕ СЕССИИ ЧЕРЕЗ ${session.warnMinutes} МИНУТ*\n\n` +
      `${session.emoji} *${session.name}*\n` +
      `🕐 Открытие: *${openTimeMsk} МСК* (${openTimeLocal} местного)\n` +
      `📍 _Время учитывает летнее/зимнее время автоматически_`
    );
    console.log(`[SESSION] ${session.name} opens in ${session.warnMinutes} min`);
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

  // ── X (Twitter) diagnostics ──────────────────────────────────────────────
  const xKeys = { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET };
  const xMissing = Object.entries(xKeys).filter(([, v]) => !v).map(([k]) => k);
  if (xMissing.length > 0) {
    console.error("[X] ❌ Отсутствуют переменные окружения:", xMissing.join(", "));
    console.error("[X] Постинг в X отключён — добавь ключи и перезапусти бота.");
  } else {
    console.log("[X] ✅ Все ключи найдены — постинг активен.");
  }

  console.log("🚀 News Craig v3 started.");
  await sendTelegram(
    "🚀 *News Craig v3 запущен!*\n\n" +
    "🔴 Срочные новости — приоритетный формат\n" +
    "⚡️ Обычные макро-новости — стандартный формат\n" +
    "📊 *Gemini: полная аналитика* — форекс, драгметаллы, нефть/газ, металлы, с/х товары, облигации\n" +
    `🐦 X: ${xMissing.length === 0 ? "✅ активен" : "❌ ключи не настроены"}\n` +
    "⏰ Напоминания за 15 минут до выхода данных\n" +
    "📈 Ценовые алерты: Золото, WTI, Brent, DXY, Медь, Серебро\n" +
    "🔔 Открытие торговых сессий\n" +
    "📰 Источники: InvestingLive, MarketWatch, Bloomberg, WSJ, ForexLive, Politico, CNBC, BBC, Sky News"
  );

  await checkAllFeeds();
  await checkCalendarReminders();
  await initPriceLevels();

  setInterval(checkAllFeeds,          POLL_INTERVAL_MS);
  setInterval(checkCalendarReminders, CALENDAR_INTERVAL_MS);
  setInterval(checkSessionAlerts,     CALENDAR_INTERVAL_MS);
  setInterval(checkWeeklyDigest,      CALENDAR_INTERVAL_MS);
  setInterval(checkDailyDigest,       CALENDAR_INTERVAL_MS);
  setInterval(checkPriceAlerts,       PRICE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
