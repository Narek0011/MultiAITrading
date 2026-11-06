import { Injectable } from '@nestjs/common';
import { background, BRAND_DEFS, C, cutText as cut, esc, H, svgOpen, svgToPng, textWidth, W, wordmark, wrapText } from './brand';

export { wrapText };

export interface HeadlineCardInput {
  /** Small badge above the headline, e.g. "MORNING BRIEF". */
  kicker: string;
  headline: string;
  date: string;
}

export interface CalendarCardInput {
  title: string;
  date: string;
  /** Word shown before the forecast, e.g. "exp." */
  expectedLabel: string;
  events: { time: string; currency: string; title: string; expected: string }[];
}

export interface MoversCardInput {
  title: string;
  subtitle: string;
  movers: { pair: string; change: number }[];
}

export interface StatsCardInput {
  title: string;
  /** e.g. "Last 7 days · 30 Oct – 5 Nov". */
  subtitle: string;
  winRate: number;
  winRateLabel: string;
  /** Up to 4 tiles: wins, losses, best streak, pips/signals. */
  /** `unit` is drawn smaller after the value, e.g. value "9" unit "in a row". */
  tiles: { label: string; value: string; unit?: string; tone: 'up' | 'down' | 'accent' | 'plain' }[];
  topPairsLabel: string;
  topPairs: { pair: string; winRate: number }[];
}

const PAD = 72;
const CURRENCY_COLOR: Record<string, string> = {
  USD: '#5B8CFF', EUR: '#2BC4FF', GBP: '#A57BFF', JPY: '#FF4D6A', AUD: '#F5B83D',
  CAD: '#FF8A4D', CHF: '#22D39B', NZD: '#7CD3FF', CNY: '#FF6B9A',
};

/** Small deterministic hash so the decorative candles differ per headline but stay stable on re-render. */
const seed = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Branded image cards for news posts that are not about one pair's chart. */
@Injectable()
export class NewsCardRendererService {
  headlinePng(input: HeadlineCardInput) {
    return svgToPng(this.headlineSvg(input));
  }

  calendarPng(input: CalendarCardInput) {
    return svgToPng(this.calendarSvg(input));
  }

  moversPng(input: MoversCardInput) {
    return svgToPng(this.moversSvg(input));
  }

  statsPng(input: StatsCardInput) {
    return svgToPng(this.statsSvg(input));
  }

  headlineSvg({ kicker, headline, date }: HeadlineCardInput) {
    const out = [svgOpen(), BRAND_DEFS, background(), wordmark()];
    out.push(this.decorCandles(headline));
    out.push(this.header(kicker, date));

    const size = headline.length <= 40 ? 76 : headline.length <= 90 ? 62 : 52;
    const lines = wrapText(headline, size, W - PAD * 2 - 40, 4);
    const lineH = size * 1.18;
    const blockH = lines.length * lineH;
    const y0 = 150 + (420 - blockH) / 2 + size * 0.85;
    out.push(`<rect x="${PAD - 28}" y="${y0 - size * 0.85}" width="6" height="${blockH}" rx="3" fill="url(#brandAI)"/>`);
    lines.forEach((l, i) => {
      out.push(`<text x="${PAD}" y="${y0 + i * lineH}" font-size="${size}" font-weight="800" fill="${C.text}" letter-spacing="-0.5">${esc(l)}</text>`);
    });
    out.push('</svg>');
    return out.join('\n');
  }

  calendarSvg({ title, date, expectedLabel, events }: CalendarCardInput) {
    const out = [svgOpen(), BRAND_DEFS, background(), wordmark(), this.header(title, date)];
    const rows = events.slice(0, 7);
    const top = 128;
    const gap = 12;
    const rowH = Math.min(74, (H - top - 40 - gap * (rows.length - 1)) / Math.max(1, rows.length));
    rows.forEach((e, i) => {
      const y = top + i * (rowH + gap);
      const mid = y + rowH / 2;
      const cur = e.currency.toUpperCase().slice(0, 3);
      const color = CURRENCY_COLOR[cur] ?? C.axis;
      out.push(`<rect x="${PAD - 24}" y="${y}" width="${W - (PAD - 24) * 2}" height="${rowH}" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)"/>`);
      out.push(`<text x="${PAD}" y="${mid + 10}" font-size="28" font-weight="800" fill="${C.text}">${esc(e.time.slice(0, 5))}</text>`);
      out.push(`<rect x="${PAD + 112}" y="${mid - 18}" width="78" height="36" rx="10" fill="${color}" fill-opacity="0.18" stroke="${color}"/>`);
      out.push(`<text x="${PAD + 151}" y="${mid + 7}" text-anchor="middle" font-size="18" font-weight="800" fill="${color}" letter-spacing="1">${esc(cur)}</text>`);
      const expected = e.expected.trim() ? `${expectedLabel} ${e.expected.trim()}` : '';
      const expW = expected ? textWidth(expected, 22) + 24 : 0;
      out.push(`<text x="${PAD + 214}" y="${mid + 9}" font-size="25" font-weight="600" fill="${C.text}">${esc(cut(e.title, 25, W - PAD * 2 - 214 - expW))}</text>`);
      if (expected) out.push(`<text x="${W - PAD}" y="${mid + 8}" text-anchor="end" font-size="22" font-weight="600" fill="${C.axis}">${esc(expected)}</text>`);
    });
    out.push('</svg>');
    return out.join('\n');
  }

  moversSvg({ title, subtitle, movers }: MoversCardInput) {
    const out = [svgOpen(), BRAND_DEFS, background(), wordmark(), this.header(title, subtitle)];
    const rows = [...movers].sort((a, b) => b.change - a.change).slice(0, 8);
    const maxAbs = Math.max(0.05, ...rows.map((m) => Math.abs(m.change)));
    const top = 132;
    const rowH = Math.min(64, (H - top - 36) / Math.max(1, rows.length));
    const axisX = 640;
    const half = 380;
    out.push(`<line x1="${axisX}" y1="${top - 10}" x2="${axisX}" y2="${top + rows.length * rowH}" stroke="rgba(255,255,255,0.18)"/>`);
    rows.forEach((m, i) => {
      const mid = top + i * rowH + rowH / 2;
      const up = m.change >= 0;
      const color = up ? C.up : C.down;
      const len = Math.max(4, (Math.abs(m.change) / maxAbs) * half);
      const barH = Math.min(34, rowH * 0.6);
      out.push(`<text x="${PAD}" y="${mid + 10}" font-size="28" font-weight="800" fill="${C.text}">${esc(m.pair)}</text>`);
      out.push(`<rect x="${up ? axisX : axisX - len}" y="${mid - barH / 2}" width="${len}" height="${barH}" rx="6" fill="${color}" fill-opacity="0.85"/>`);
      const label = `${up ? '+' : ''}${m.change.toFixed(2)}%`;
      out.push(`<text x="${W - PAD}" y="${mid + 9}" text-anchor="end" font-size="26" font-weight="800" fill="${color}">${label}</text>`);
    });
    out.push('</svg>');
    return out.join('\n');
  }

  /** Title pill + small grey line (date or subtitle) in the top-left corner. */
  /** Signal results: big win-rate ring on the left, number tiles on the right, best pairs below. */
  statsSvg({ title, subtitle, winRate, winRateLabel, tiles, topPairsLabel, topPairs }: StatsCardInput) {
    const out = [svgOpen(), BRAND_DEFS, background(), wordmark(), this.header(title, subtitle)];
    const pct = Math.max(0, Math.min(100, Math.round(winRate)));
    const cx = 280;
    const cy = 400;
    const r = 176;
    const len = 2 * Math.PI * r;
    out.push(`<defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22D39B"/><stop offset="1" stop-color="#2BC4FF"/></linearGradient>` +
      `<radialGradient id="ringGlow"><stop offset="0" stop-color="#22D39B" stop-opacity="0.22"/><stop offset="1" stop-color="#22D39B" stop-opacity="0"/></radialGradient></defs>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r + 70}" fill="url(#ringGlow)"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(7,11,22,0.55)" stroke="rgba(255,255,255,0.08)" stroke-width="30"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring)" stroke-width="30" stroke-linecap="round" stroke-dasharray="${((len * pct) / 100).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`);
    out.push(`<text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="104" font-weight="800" fill="${C.text}" letter-spacing="-2">${pct}<tspan font-size="54" fill="${C.up}">%</tspan></text>`);
    out.push(`<text x="${cx}" y="${cy + 78}" text-anchor="middle" font-size="22" font-weight="800" fill="${C.axis}" letter-spacing="2">${esc(cut(winRateLabel.toUpperCase(), 22, r * 1.5))}</text>`);

    const tone = { up: C.up, down: '#FF7A8F', accent: '#F5B83D', plain: C.text };
    const x0 = 540;
    const gap = 20;
    const tileW = (W - PAD - x0 - gap) / 2;
    const tileH = 150;
    tiles.slice(0, 4).forEach((t, i) => {
      const x = x0 + (i % 2) * (tileW + gap);
      const y = 150 + Math.floor(i / 2) * (tileH + gap);
      const color = tone[t.tone];
      out.push(`<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="20" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.08)"/>`);
      out.push(`<rect x="${x}" y="${y + 24}" width="5" height="${tileH - 48}" rx="2.5" fill="${color}"/>`);
      out.push(`<text x="${x + 30}" y="${y + 50}" font-size="20" font-weight="600" fill="${C.axis}">${esc(cut(t.label, 20, tileW - 50))}</text>`);
      // Bold digits run ~0.64em wide; shrink the value when value + unit would leave the tile.
      const room = tileW - 60;
      const unitW = t.unit ? textWidth(t.unit, 26) + 14 : 0;
      const size = Math.min(t.tone === 'down' ? 50 : 60, Math.floor((room - unitW) / Math.max(1, t.value.length * 0.64)));
      const unit = t.unit ? `<tspan dx="12" font-size="26" font-weight="700" fill="${C.axis}" letter-spacing="0">${esc(cut(t.unit, 26, room - t.value.length * size * 0.64 - 14))}</tspan>` : '';
      out.push(`<text x="${x + 30}" y="${y + 120}" font-size="${size}" font-weight="800" fill="${color}" letter-spacing="-1">${esc(t.value)}${unit}</text>`);
    });

    const pairs = topPairs.slice(0, 3);
    if (pairs.length) {
      const py = 150 + 2 * (tileH + gap) + 34;
      out.push(`<text x="${x0}" y="${py}" font-size="18" font-weight="800" fill="${C.axis}" letter-spacing="2">${esc(topPairsLabel.toUpperCase())}</text>`);
      const chipW = (W - PAD - x0 - gap * 2) / 3;
      pairs.forEach((p, i) => {
        const x = x0 + i * (chipW + gap);
        const y = py + 16;
        out.push(`<rect x="${x}" y="${y}" width="${chipW}" height="64" rx="16" fill="rgba(34,211,155,0.10)" stroke="rgba(34,211,155,0.35)"/>`);
        out.push(`<text x="${x + 20}" y="${y + 40}" font-size="20" font-weight="800" fill="${C.text}">${esc(p.pair)}</text>`);
        out.push(`<text x="${x + chipW - 18}" y="${y + 40}" text-anchor="end" font-size="20" font-weight="800" fill="${C.up}">${p.winRate}%</text>`);
      });
    }
    out.push('</svg>');
    return out.join('\n');
  }

  private header(title: string, sub: string) {
    const t = title.toUpperCase();
    // Bold capitals with letter-spacing run wider than normal text.
    const w = t.length * (18 * 0.7 + 1.5) + 44;
    return [
      `<rect x="${PAD - 24}" y="30" width="${w}" height="40" rx="20" fill="#3B5BFF" fill-opacity="0.18" stroke="#5B8CFF" stroke-opacity="0.6"/>`,
      `<text x="${PAD - 2}" y="56" font-size="18" font-weight="800" fill="#9DB6FF" letter-spacing="1.5">${esc(t)}</text>`,
      `<text x="${PAD - 24 + w + 18}" y="57" font-size="19" font-weight="600" fill="${C.axis}">${esc(sub)}</text>`,
      `<line x1="${PAD - 24}" y1="96" x2="${W - 28}" y2="96" stroke="rgba(255,255,255,0.06)"/>`,
    ].join('\n');
  }

  /** Faint candles along the bottom so the headline card still looks like a trading image. */
  private decorCandles(key: string) {
    let s = seed(key);
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const out: string[] = [];
    let price = 0.5;
    for (let i = 0; i < 44; i++) {
      const open = price;
      price = Math.min(0.95, Math.max(0.05, price + (rnd() - 0.47) * 0.16));
      const hi = Math.max(open, price) + rnd() * 0.05;
      const lo = Math.min(open, price) - rnd() * 0.05;
      const y = (v: number) => H - 24 - v * 190;
      const x = 40 + i * 28.2;
      const color = price >= open ? C.up : C.down;
      out.push(`<line x1="${x}" y1="${y(hi)}" x2="${x}" y2="${y(lo)}" stroke="${color}" stroke-opacity="0.22"/>`);
      out.push(`<rect x="${x - 7}" y="${y(Math.max(open, price))}" width="14" height="${Math.max(2, Math.abs(y(open) - y(price)))}" rx="2" fill="${color}" fill-opacity="0.22"/>`);
    }
    return out.join('\n');
  }
}
