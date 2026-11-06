import { formatPrice, TIMEFRAME_LABEL, toPips } from '../common/forex';
import { SignalLang, Timeframe } from '../settings/settings.types';

const T = {
  en: {
    entry: 'Entry', tp1: 'Take Profit 1', tp2: 'Take Profit 2', sl: 'Stop Loss', timeframe: 'Timeframe',
    confidence: 'AI confidence', confidenceCustom: 'Signal strength', analysis: 'Analysis', risk: 'Risk', reward: 'Reward',
    tp1Hit: (p: number) => `✅ <b>TP1 reached</b> +${p} pips`,
    tp1HitBe: (p: number) => `✅ <b>TP1 reached</b> +${p} pips — move stop to breakeven`,
    tp2Hit: (p: number) => `🏆 <b>TP2 reached</b> +${p} pips — trade closed`,
    slHit: (p: number) => `❌ <b>Stop loss hit</b> −${p} pips`,
    beHit: '⚖️ <b>Closed at breakeven</b> after TP1',
    expired: '⌛ <b>Signal expired</b> — targets not reached',
    test: '✅ <b>MultiAITrading</b> is connected to this channel.',
  },
  ru: {
    entry: 'Вход', tp1: 'Тейк-профит 1', tp2: 'Тейк-профит 2', sl: 'Стоп-лосс', timeframe: 'Таймфрейм',
    confidence: 'Уверенность AI', confidenceCustom: 'Сила сигнала', analysis: 'Анализ', risk: 'Риск', reward: 'Прибыль',
    tp1Hit: (p: number) => `✅ <b>TP1 достигнут</b> +${p} пипсов`,
    tp1HitBe: (p: number) => `✅ <b>TP1 достигнут</b> +${p} пипсов — переносим стоп в безубыток`,
    tp2Hit: (p: number) => `🏆 <b>TP2 достигнут</b> +${p} пипсов — сделка закрыта`,
    slHit: (p: number) => `❌ <b>Сработал стоп-лосс</b> −${p} пипсов`,
    beHit: '⚖️ <b>Закрыто в безубыток</b> после TP1',
    expired: '⌛ <b>Сигнал истёк</b> — цели не достигнуты',
    test: '✅ <b>MultiAITrading</b> подключён к этому каналу.',
  },
  es: {
    entry: 'Entrada', tp1: 'Take Profit 1', tp2: 'Take Profit 2', sl: 'Stop Loss', timeframe: 'Temporalidad',
    confidence: 'Confianza IA', confidenceCustom: 'Fuerza de la señal', analysis: 'Análisis', risk: 'Riesgo', reward: 'Beneficio',
    tp1Hit: (p: number) => `✅ <b>TP1 alcanzado</b> +${p} pips`,
    tp1HitBe: (p: number) => `✅ <b>TP1 alcanzado</b> +${p} pips — mueve el stop a break-even`,
    tp2Hit: (p: number) => `🏆 <b>TP2 alcanzado</b> +${p} pips — operación cerrada`,
    slHit: (p: number) => `❌ <b>Stop loss alcanzado</b> −${p} pips`,
    beHit: '⚖️ <b>Cerrada en break-even</b> tras TP1',
    expired: '⌛ <b>Señal expirada</b> — objetivos no alcanzados',
    test: '✅ <b>MultiAITrading</b> está conectado a este canal.',
  },
  hy: {
    entry: 'Մուտք', tp1: 'Թեյք պրոֆիտ 1', tp2: 'Թեյք պրոֆիտ 2', sl: 'Ստոպ լոս', timeframe: 'Թայմֆրեյմ',
    confidence: 'AI վստահություն', confidenceCustom: 'Ազդանշանի ուժ', analysis: 'Վերլուծություն', risk: 'Ռիսկ', reward: 'Շահույթ',
    tp1Hit: (p: number) => `✅ <b>TP1-ը հասավ</b> +${p} պիպս`,
    tp1HitBe: (p: number) => `✅ <b>TP1-ը հասավ</b> +${p} պիպս — ստոպը տեղափոխեք անվնաս կետ`,
    tp2Hit: (p: number) => `🏆 <b>TP2-ը հասավ</b> +${p} պիպս — գործարքը փակված է`,
    slHit: (p: number) => `❌ <b>Ստոպ լոսը գործեց</b> −${p} պիպս`,
    beHit: '⚖️ <b>Փակվեց անվնաս կետում</b> TP1-ից հետո',
    expired: '⌛ <b>Ազդանշանի ժամկետը լրացավ</b> — նպատակները չհասան',
    test: '✅ <b>MultiAITrading</b>-ը միացված է այս ալիքին։',
  },
};

export const telegramText = (lang: SignalLang) => T[lang] ?? T.en;

/** Icon slots of an expiry-style post; each can be a Telegram custom emoji (by ID) or falls back to a normal emoji. */
export const EMOJI_SLOTS = {
  emojiUp: '📈',
  emojiDown: '📉',
  emojiClock: '⏱',
  emojiAi: '🤖',
  emojiBullet: '🧠',
  emojiConfidence: '👨‍🔬',
  emojiFooter: '📊',
} as const;
export type EmojiSlot = keyof typeof EMOJI_SLOTS;
export type EmojiIds = Partial<Record<EmojiSlot, string>>;

/** Text of expiry-style posts, as in the brand screenshots. */
const X = {
  en: {
    head: (buy: boolean, pair: string, min: number) => `${buy ? 'BUY' : 'SELL'} ${pair} • ${min} MIN`,
    title: 'AI TRADING SIGNAL',
    asset: 'Asset:', direction: 'Direction:', expiration: 'Expiration:', status: 'Status:',
    dir: (buy: boolean) => (buy ? 'BUY / UP' : 'SELL / DOWN'),
    exp: (mmss: string) => mmss, active: 'ACTIVE',
    confidence: (c: number) => `<b>CONFIDENCE — ${c}%</b>`,
    footer: 'MultiAI Trading • AI-Powered Analysis',
    boldLabels: false,
  },
  ru: {
    head: (buy: boolean, pair: string, min: number) => `${buy ? 'ВВЕРХ (BUY)' : 'ВНИЗ (SELL)'} ${pair} • ${min} МИН`,
    title: 'AI TRADING SIGNAL',
    asset: 'Актив:', direction: 'Направление:', expiration: 'Экспирация:', status: 'Статус:',
    dir: (buy: boolean) => (buy ? 'ПОКУПКА / ВВЕРХ' : 'ПРОДАЖА / ВНИЗ'),
    exp: (mmss: string) => `${mmss} мин`, active: 'АКТИВЕН',
    confidence: (c: number) => `<b>УВЕРЕННОСТЬ AI — ${c}%</b>`,
    footer: 'MultiAI Trading • Анализ на основе искусственного интеллекта',
    boldLabels: true,
  },
  es: {
    head: (buy: boolean, pair: string, min: number) => `${buy ? 'ARRIBA (BUY)' : 'ABAJO (SELL)'} ${pair} • ${min} MIN`,
    title: 'AI TRADING SIGNAL',
    asset: 'Activo:', direction: 'Dirección:', expiration: 'Expiración:', status: 'Estado:',
    dir: (buy: boolean) => (buy ? 'COMPRA / ARRIBA' : 'VENTA / ABAJO'),
    exp: (mmss: string) => `${mmss} min`, active: 'ACTIVA',
    confidence: (c: number) => `<b>CONFIANZA IA — ${c}%</b>`,
    footer: 'MultiAI Trading • Análisis impulsado por IA',
    boldLabels: true,
  },
  hy: {
    head: (buy: boolean, pair: string, min: number) => `${buy ? 'ՎԵՐԵՎ (BUY)' : 'ՆԵՐՔԵՎ (SELL)'} ${pair} • ${min} ՐՈՊԵ`,
    title: 'AI TRADING SIGNAL',
    asset: 'Արժութային զույգ՝', direction: 'Ուղղություն՝', expiration: 'Գործարքի տևողություն՝', status: 'Կարգավիճակ՝',
    dir: (buy: boolean) => (buy ? 'ԳՆՈՒՄ / ՎԵՐԵՎ' : 'ՎԱՃԱՌՔ / ՆԵՐՔԵՎ'),
    exp: (mmss: string) => `${mmss} րոպե`, active: 'ԱԿՏԻՎ',
    confidence: (c: number) => `AI ՎՍՏԱՀՈՒԹՅԱՆ ՄԱԿԱՐԴԱԿ՝ ${c}%`,
    footer: 'MultiAI Trading • Արհեստական բանականության վրա հիմնված վերլուծություն',
    boldLabels: true,
  },
};

/** "2" → "02:00" (minutes:seconds, as shown on broker platforms). */
export const expiryClock = (minutes: number) => `${String(Math.floor(minutes)).padStart(2, '0')}:00`;

export interface ExpiryCaptionInput {
  pair: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
  expiryMinutes: number;
}

/** Expiry-style caption. Custom emoji are used only for slots with an ID (and only when `useCustomEmoji`). */
export function expiryCaption(s: ExpiryCaptionInput, lang: SignalLang, opts: { showConfidence: boolean; emoji?: EmojiIds; useCustomEmoji?: boolean }): string {
  const t = X[lang] ?? X.en;
  const icon = (slot: EmojiSlot) => {
    const id = opts.useCustomEmoji === false ? '' : (opts.emoji?.[slot] ?? '').trim();
    return /^\d+$/.test(id) ? `<tg-emoji emoji-id="${id}">${EMOJI_SLOTS[slot]}</tg-emoji>` : EMOJI_SLOTS[slot];
  };
  const buy = s.direction === 'BUY';
  const label = (l: string) => (t.boldLabels ? `<b>${l}</b>` : l);
  const lines = [
    `${icon(buy ? 'emojiUp' : 'emojiDown')}<b>${t.head(buy, s.pair, s.expiryMinutes)}</b> ${icon('emojiClock')}`,
    '',
    `${icon('emojiAi')}<b>${t.title}</b>`,
    '',
    `${icon('emojiBullet')}${label(t.asset)} ${s.pair}`,
    `${icon('emojiBullet')}${label(t.direction)} ${t.dir(buy)}`,
    `${icon('emojiBullet')}${label(t.expiration)} ${t.exp(expiryClock(s.expiryMinutes))}`,
    `${icon('emojiBullet')}${label(t.status)} ${t.active}`,
  ];
  if (opts.showConfidence) lines.push('', `${icon('emojiConfidence')}${t.confidence(s.confidence)}`);
  lines.push('', `<blockquote>${icon('emojiFooter')}<i>${t.footer}</i></blockquote>`);
  return lines.join('\n');
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CaptionInput {
  pair: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  confidence: number;
  reasoning: string;
  timeframe: Timeframe;
  mode: 'AI' | 'CUSTOM';
}

export function signalCaption(s: CaptionInput, lang: SignalLang, opts: { showReasoning: boolean; showConfidence: boolean }): string {
  const t = telegramText(lang);
  const f = (v: number) => formatPrice(s.pair, v);
  const head = s.direction === 'BUY' ? '🟢' : '🔴';
  const tag = `#${s.pair.replace('/', '')}`;
  const lines = [
    `${head} <b>${s.direction} ${s.pair}</b>  ${tag}`,
    '━━━━━━━━━━━━━━',
    `📍 ${t.entry}: <code>${f(s.entry)}</code>`,
    `🎯 ${t.tp1}: <code>${f(s.takeProfit1)}</code>  (+${toPips(s.pair, Math.abs(s.takeProfit1 - s.entry))} pips)`,
    `🎯 ${t.tp2}: <code>${f(s.takeProfit2)}</code>  (+${toPips(s.pair, Math.abs(s.takeProfit2 - s.entry))} pips)`,
    `🛑 ${t.sl}: <code>${f(s.stopLoss)}</code>  (−${toPips(s.pair, Math.abs(s.entry - s.stopLoss))} pips)`,
    '',
    `⏱ ${t.timeframe}: <b>${TIMEFRAME_LABEL[s.timeframe]}</b>`,
  ];
  if (opts.showConfidence) lines.push(`🤖 ${s.mode === 'AI' ? t.confidence : t.confidenceCustom}: <b>${s.confidence}%</b>`);

  if (opts.showReasoning && s.reasoning) {
    // Telegram photo captions are limited to 1024 characters.
    const used = lines.join('\n').length + t.analysis.length + 20;
    let reasoning = escapeHtml(s.reasoning.trim());
    if (used + reasoning.length > 1024) reasoning = reasoning.slice(0, 1024 - used - 1).trimEnd() + '…';
    lines.push('', `🧠 <b>${t.analysis}:</b> ${reasoning}`);
  }
  return lines.join('\n');
}

const RESULT_WORD: Record<SignalLang, Record<'WIN' | 'LOSS' | 'EXPIRED', string>> = {
  en: { WIN: 'WIN', LOSS: 'LOSS', EXPIRED: 'DRAW' },
  ru: { WIN: 'ПЛЮС', LOSS: 'МИНУС', EXPIRED: 'НИЧЬЯ' },
  es: { WIN: 'GANADA', LOSS: 'PERDIDA', EXPIRED: 'EMPATE' },
  hy: { WIN: 'ՇԱՀՈՒՄ', LOSS: 'ԿՈՐՈՒՍՏ', EXPIRED: 'ՈՉ-ՈՔԻ' },
};

/** Reply to an expiry-style signal once it settles: "✅ WIN · GBP/CAD 📈" + entry → close price. */
export function expiryResultText(outcome: 'WIN' | 'LOSS' | 'EXPIRED', s: { pair: string; direction: 'BUY' | 'SELL'; entry: number }, close: number, lang: SignalLang): string {
  const word = (RESULT_WORD[lang] ?? RESULT_WORD.en)[outcome];
  const icon = { WIN: '✅', LOSS: '❌', EXPIRED: '⚖️' }[outcome];
  return `${icon} <b>${word}</b> · ${s.pair} ${s.direction === 'BUY' ? '📈' : '📉'}\n${outcome === 'WIN' ? '💰' : '📊'} ${formatPrice(s.pair, s.entry)} → ${formatPrice(s.pair, close)}`;
}

/** "AI is analyzing" post before a scheduled signal (deleted once the signal is out). */
const ANALYZING: Record<SignalLang, { title: string; wait: string }> = {
  en: { title: 'AI is analyzing the market…', wait: 'Signal in a moment' },
  ru: { title: 'AI анализирует рынок…', wait: 'Сигнал через минуту' },
  es: { title: 'La IA está analizando el mercado…', wait: 'Señal en un momento' },
  hy: { title: 'AI-ն վերլուծում է շուկան…', wait: 'Ազդանշանը շուտով' },
};

export function analyzingText(pairs: string[], lang: SignalLang): string {
  const t = ANALYZING[lang] ?? ANALYZING.en;
  const lines = [`🤖 <b>${t.title}</b>`];
  if (pairs.length) lines.push(`🔍 ${pairs.slice(0, 5).join(' · ')}${pairs.length > 5 ? ' …' : ''}`);
  lines.push(`⏳ <i>${t.wait}</i>`);
  return lines.join('\n');
}
