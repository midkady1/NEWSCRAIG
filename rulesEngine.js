const RULES = [
  {
    name: 'Fed Hawkish',
    keywords: ['fed', 'rate hike', 'inflation'],
    impact: 'USD bullish, equities bearish'
  },
  {
    name: 'China Slowdown',
    keywords: ['china slowdown', 'weak china data'],
    impact: 'Copper bearish, AUD bearish'
  }
];

exports.evaluateNews = (text) => {
  const lower = text.toLowerCase();

  const matches = RULES.filter(rule =>
    rule.keywords.some(k => lower.includes(k))
  );

  return {
    confidence: Math.min(matches.length * 25, 100),
    matches
  };
};
