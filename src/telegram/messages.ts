import { formatPrice, TIMEFRAME_LABEL, toPips } from '../common/forex';
import { Lang, Timeframe } from '../settings/settings.types';

const T = {
  en: {
    entry: 'Entry', tp1: 'Take Profit 1', tp2: 'Take Profit 2', sl: 'Stop Loss', timeframe: 'Timeframe',
    confidence: 'AI confidence', confidenceCustom: 'Signal strength', analysis: 'Analysis', risk: 'Risk', reward: 'Reward',
    footer: 'Manage your risk. Not financial advice.',
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
    footer: 'Управляйте рисками. Не является финансовой рекомендацией.',
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
    footer: 'Gestiona tu riesgo. No es asesoramiento financiero.',
    tp1Hit: (p: number) => `✅ <b>TP1 alcanzado</b> +${p} pips`,
    tp1HitBe: (p: number) => `✅ <b>TP1 alcanzado</b> +${p} pips — mueve el stop a break-even`,
    tp2Hit: (p: number) => `🏆 <b>TP2 alcanzado</b> +${p} pips — operación cerrada`,
    slHit: (p: number) => `❌ <b>Stop loss alcanzado</b> −${p} pips`,
    beHit: '⚖️ <b>Cerrada en break-even</b> tras TP1',
    expired: '⌛ <b>Señal expirada</b> — objetivos no alcanzados',
    test: '✅ <b>MultiAITrading</b> está conectado a este canal.',
  },
};

export const telegramText = (lang: Lang) => T[lang] ?? T.en;

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

export function signalCaption(s: CaptionInput, lang: Lang, opts: { showReasoning: boolean; showConfidence: boolean }): string {
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

  const footer = ['━━━━━━━━━━━━━━', `<i>MultiAITrading • ${t.footer}</i>`];
  if (opts.showReasoning && s.reasoning) {
    // Telegram photo captions are limited to 1024 characters.
    const used = [...lines, ...footer].join('\n').length + t.analysis.length + 20;
    let reasoning = escapeHtml(s.reasoning.trim());
    if (used + reasoning.length > 1024) reasoning = reasoning.slice(0, 1024 - used - 1).trimEnd() + '…';
    lines.push('', `🧠 <b>${t.analysis}:</b> ${reasoning}`);
  }
  return [...lines, ...footer].join('\n');
}
