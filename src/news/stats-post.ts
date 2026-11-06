import { StatsCardInput } from '../charts/news-card-renderer.service';
import { NewsLang } from '../settings/settings.types';
import { PeriodStats, periodStart, StatsPeriod } from '../signals/period-stats';

interface StatsText {
  title: string;
  period: Record<StatsPeriod, string>;
  winRate: string;
  wins: string;
  losses: string;
  streak: string;
  inARow: string;
  pips: string;
  signals: string;
  topPairs: string;
  latestWins: string;
  headline: (rate: number) => string;
  footer: string;
}

const T: Record<NewsLang, StatsText> = {
  en: {
    title: 'Signal results',
    period: { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' },
    winRate: 'Win rate', wins: 'Wins', losses: 'Losses', streak: 'Best streak', inARow: 'in a row', pips: 'Pips', signals: 'Signals',
    topPairs: 'Top pairs', latestWins: 'Latest wins',
    headline: (r) => `${r}% of our signals hit the target`,
    footer: 'MultiAI Trading • AI-Powered Analysis',
  },
  ru: {
    title: 'Результаты сигналов',
    period: { today: 'Сегодня', '7d': 'Последние 7 дней', '30d': 'Последние 30 дней', all: 'За всё время' },
    winRate: 'Винрейт', wins: 'Прибыльные', losses: 'Убыточные', streak: 'Лучшая серия', inARow: 'подряд', pips: 'Пипсы', signals: 'Сигналы',
    topPairs: 'Лучшие пары', latestWins: 'Последние плюсы',
    headline: (r) => `${r}% наших сигналов дошли до цели`,
    footer: 'MultiAI Trading • Анализ на базе ИИ',
  },
  es: {
    title: 'Resultados de señales',
    period: { today: 'Hoy', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', all: 'Histórico' },
    winRate: 'Tasa de acierto', wins: 'Ganadoras', losses: 'Perdedoras', streak: 'Mejor racha', inARow: 'seguidas', pips: 'Pips', signals: 'Señales',
    topPairs: 'Mejores pares', latestWins: 'Últimas ganadoras',
    headline: (r) => `El ${r}% de nuestras señales alcanzó el objetivo`,
    footer: 'MultiAI Trading • Análisis impulsado por IA',
  },
  hy: {
    title: 'Ազդանշանների արդյունքներ',
    period: { today: 'Այսօր', '7d': 'Վերջին 7 օր', '30d': 'Վերջին 30 օր', all: 'Ամբողջ ժամանակ' },
    winRate: 'Հաջողության տոկոս', wins: 'Հաղթանակներ', losses: 'Պարտություններ', streak: 'Լավագույն շարք', inARow: 'անընդմեջ', pips: 'Փիփսեր', signals: 'Ազդանշաններ',
    topPairs: 'Լավագույն զույգեր', latestWins: 'Վերջին հաղթանակները',
    headline: (r) => `Մեր ազդանշանների ${r}%-ը հասավ նպատակին`,
    footer: 'MultiAI Trading • Արհեստական բանականության վրա հիմնված վերլուծություն',
  },
};

export const statsText = (lang: NewsLang) => T[lang] ?? T.en;

const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** "Last 7 days · 31.10 – 06.11"; today shows its date; all time has no dates. */
export function periodLabel(period: StatsPeriod, lang: NewsLang, now = new Date()) {
  const name = statsText(lang).period[period];
  const from = periodStart(period, now);
  if (!from) return name;
  return period === 'today' ? `${name} · ${ddmm(now)}` : `${name} · ${ddmm(from)} – ${ddmm(now)}`;
}

/** Wins and the best streak lead; pips only when they add to the story (expiry signals have none). */
export function statsCard(s: PeriodStats, lang: NewsLang, now = new Date()): StatsCardInput {
  const t = statsText(lang);
  const last = s.pips > 0 ? { label: t.pips, value: `+${s.pips}`, tone: 'plain' as const } : { label: t.signals, value: String(s.wins + s.losses), tone: 'plain' as const };
  return {
    title: t.title,
    subtitle: periodLabel(s.period, lang, now),
    winRate: s.winRate ?? 0,
    winRateLabel: t.winRate,
    tiles: [
      { label: t.wins, value: String(s.wins), tone: 'up' },
      { label: t.losses, value: String(s.losses), tone: 'down' },
      { label: t.streak, value: String(s.bestStreak), unit: t.inARow, tone: 'accent' },
      last,
    ],
    topPairsLabel: t.topPairs,
    topPairs: s.topPairs.map((p) => ({ pair: p.pair, winRate: p.winRate })),
  };
}

/** Telegram HTML caption (kept well under the 1024-char photo caption limit). */
export function statsCaption(s: PeriodStats, lang: NewsLang, now = new Date()): string {
  const t = statsText(lang);
  const lines = [
    `🏆 <b>${t.title.toUpperCase()}</b>`,
    `<i>${periodLabel(s.period, lang, now)}</i>`,
    '',
    `🎯 <b>${t.headline(s.winRate ?? 0)}</b>`,
    '',
    `✅ ${t.wins}: <b>${s.wins}</b>`,
    `❌ ${t.losses}: <b>${s.losses}</b>`,
  ];
  if (s.bestStreak >= 2) lines.push(`🔥 ${t.streak}: <b>${s.bestStreak} ${t.inARow}</b>`);
  if (s.pips > 0) lines.push(`💰 ${t.pips}: <b>+${s.pips}</b>`);
  if (s.topPairs.length) lines.push('', `📊 <b>${t.topPairs}:</b> ${s.topPairs.map((p) => `${p.pair} ${p.winRate}%`).join(' · ')}`);
  const wins = s.recent.filter((r) => r.win).slice(0, 6);
  if (wins.length) lines.push('', `<b>${t.latestWins}:</b>`, ...wins.map((r) => `✅ ${r.pair} ${r.direction === 'BUY' ? '📈' : '📉'}`));
  lines.push('', `<blockquote><i>${t.footer}</i></blockquote>`);
  return lines.join('\n');
}
