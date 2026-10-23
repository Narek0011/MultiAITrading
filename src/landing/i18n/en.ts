export const en = {
  meta: {
    title: 'MultiAITrading — AI Forex Signals in Telegram',
    description: 'AI-powered forex signals for 17 major and cross pairs. Entry, take profit and stop loss with a real market chart, delivered to Telegram.',
  },
  nav: { how: 'How it works', ai: 'AI analysis', results: 'Results', pairs: 'Pairs', faq: 'FAQ', join: 'Get access' },
  hero: {
    badge: 'Powered by OpenAI’s latest models',
    title: 'Forex signals built by <span class="grad">AI</span>.<br/>Delivered to Telegram.',
    subtitle: 'MultiAITrading scans 17 currency pairs around the clock, reads price action and indicators like a team of analysts, and sends you only the setups worth taking — with entry, targets, stop loss and a real chart.',
    ctaSignals: 'Join the signals channel',
    ctaSupport: 'Talk to support',
    trust: ['17 major & cross pairs', 'Entry · TP1 · TP2 · SL', 'Real-time chart with every signal'],
  },
  card: { live: 'Live signal', entry: 'Entry', tp: 'Take profit', sl: 'Stop loss', confidence: 'AI confidence' },
  stats: { winRate: 'Win rate (closed signals)', signals: 'Signals delivered', pairs: 'Currency pairs covered', pips: 'Net pips captured', fallback: [{ value: '24/5', label: 'Market scanning' }, { value: 'TP1 · TP2 · SL', label: 'On every signal' }, { value: 'EN · RU · ES', label: 'Signal languages' }] },
  how: {
    eyebrow: 'How it works',
    title: 'From raw market data to a clear trade — in seconds',
    steps: [
      { title: 'Market data', text: 'Fresh candles for every pair are pulled from a professional market data feed on your chosen timeframe, plus a higher timeframe for trend context.' },
      { title: 'AI analysis', text: 'Our AI engine weighs trend, momentum, structure and volatility. If the setup is not clean, no signal is sent — discipline is built in.' },
      { title: 'Signal in Telegram', text: 'You receive direction, entry, two targets and a stop loss, a short explanation and a chart that matches the live market.' },
    ],
  },
  ai: {
    eyebrow: 'AI analysis',
    title: 'Analysis that reads the market like a <span class="grad">desk of analysts</span>',
    text: 'Every scan sends the latest candles and a full indicator snapshot to OpenAI’s most capable models. The model must justify each trade and return an honest confidence score — anything below our threshold is discarded.',
    points: [
      { title: 'Multi-timeframe context', text: 'Entries on the signal timeframe, trend confirmed one timeframe higher.' },
      { title: 'Indicator confluence', text: 'EMA trend, RSI momentum, MACD and ATR volatility checked together.' },
      { title: 'Structure-aware levels', text: 'Stops beyond swing points, targets with at least 1:1 and 1:2 reward.' },
      { title: 'Confidence filter', text: 'Only setups above the minimum confidence are published.' },
    ],
    modelsLabel: 'Engine',
    models: ['OpenAI GPT models', 'Technical indicator engine', 'ATR risk model'],
  },
  features: {
    eyebrow: 'Why traders stay',
    title: 'Everything you need in one message',
    items: [
      { icon: 'chart', title: 'Real chart with every signal', text: 'Candles, EMAs, RSI and the exact entry, TP and SL zones rendered from live market data.' },
      { icon: 'target', title: 'Clear levels', text: 'Entry, two take-profit targets and a stop loss with the distance in pips. No guesswork.' },
      { icon: 'bell', title: 'Results tracked for you', text: 'When a target or stop is hit, the bot replies to the original signal so you always know the outcome.' },
      { icon: 'clock', title: 'Session-aware', text: 'Signals focus on the most liquid hours — London and New York — and pause on weekends.' },
      { icon: 'shield', title: 'Risk discipline', text: 'Daily limits and per-pair cooldowns stop over-trading. Quality over quantity.' },
      { icon: 'globe', title: 'English · Русский · Español', text: 'Signals and analysis in your language.' },
    ],
  },
  results: { eyebrow: 'Track record', title: 'Recent closed signals', pair: 'Pair', side: 'Side', result: 'Result', pips: 'Pips', empty: 'Results will appear here as soon as the first signals close.' },
  sample: { eyebrow: 'Signal anatomy', title: 'This is what lands in your Telegram', caption: 'Chart generated automatically from real market candles at the moment of the signal.' },
  pairs: { eyebrow: 'Coverage', title: '17 currency pairs, scanned non-stop', text: 'Majors and the most traded crosses across USD, EUR, GBP, JPY, AUD, CAD and CHF.' },
  access: {
    eyebrow: 'Get access',
    title: 'Three steps to the private signals channel',
    steps: [
      { title: 'Message support', text: 'Write to our support in Telegram — we answer personally.' },
      { title: 'Register with our partner', text: 'We send you a partner registration link to open your trading account.' },
      { title: 'Get added to the channel', text: 'Once registered, you are added to the private channel and start receiving signals.' },
    ],
    cta: 'Message support now',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    items: [
      { q: 'How are the signals generated?', a: 'An AI engine built on OpenAI’s latest models analyses fresh market candles together with EMA, RSI, MACD and ATR. A setup is only published when trend, momentum and structure agree and the confidence clears our threshold.' },
      { q: 'What does a signal include?', a: 'Pair and direction (BUY/SELL), entry price, two take-profit levels, a stop loss, pips to each level, the timeframe, a confidence score, a short explanation and a chart from the live market.' },
      { q: 'How many signals per day?', a: 'It depends on the market. We cap the number per day and apply cooldowns per pair, so you get fewer, higher-quality setups instead of noise.' },
      { q: 'Which pairs do you cover?', a: 'USD/CHF, CAD/JPY, AUD/USD, USD/JPY, GBP/CAD, AUD/CAD, AUD/JPY, CAD/CHF, GBP/USD, GBP/AUD, EUR/CHF, EUR/GBP, EUR/USD, USD/CAD, AUD/CHF, EUR/JPY and GBP/JPY.' },
      { q: 'How do I join?', a: 'Message our support in Telegram. We will send you a partner registration link; once you are registered we add you to the private signals channel.' },
      { q: 'Is profit guaranteed?', a: 'No. Trading forex involves significant risk. Signals are analysis, not financial advice — always use a stop loss and risk only what you can afford to lose.' },
    ],
  },
  final: { title: 'Ready to trade with an AI analyst on your side?', text: 'Join the channel or talk to support — it takes a minute.' },
  footer: {
    rights: 'All rights reserved.',
    disclaimer: 'Risk warning: trading foreign exchange on margin carries a high level of risk and may not be suitable for all investors. Past performance is not indicative of future results. Signals are provided for informational purposes only and do not constitute financial advice.',
  },
  outcome: { TP1: 'TP1', TP2: 'TP2', SL: 'Stop', BE: 'Breakeven' },
};

export type Dictionary = typeof en;
