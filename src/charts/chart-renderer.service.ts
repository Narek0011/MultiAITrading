import { Injectable } from '@nestjs/common';
import { Candle, Direction } from '../common/types';
import { formatPrice, TIMEFRAME_LABEL } from '../common/forex';
import { Timeframe } from '../settings/settings.types';
import { IndicatorSeries } from '../analysis/indicators';
import { background, BRAND_DEFS, C, esc, H, svgOpen, svgToPng, W, wordmark } from './brand';

export interface ChartInput {
  pair: string;
  timeframe: Timeframe;
  candles: Candle[];
  indicators?: IndicatorSeries;
  emaLabels?: [string, string];
  signal?: {
    direction: Direction;
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    confidence?: number;
  };
  /** Support/resistance lines for news charts; label is short (e.g. "R1", "S1"). */
  levels?: { label: string; price: number }[];
}

@Injectable()
export class ChartRendererService {
  renderPng(input: ChartInput): Buffer {
    return svgToPng(this.renderSvg(input));
  }

  renderSvg({ pair, timeframe, candles: all, indicators, signal, emaLabels, levels: marks = [] }: ChartInput): string {
    const VISIBLE = 90;
    const FUTURE = signal ? 16 : 3;
    const offset = Math.max(0, all.length - VISIBLE);
    const candles = all.slice(offset);
    const slice = (arr?: (number | null)[]) => arr?.slice(offset) ?? [];
    const emaFast = slice(indicators?.emaFast);
    const emaSlow = slice(indicators?.emaSlow);
    const rsi = slice(indicators?.rsi);
    const hasRsi = rsi.some((v) => v != null);

    // Layout
    const left = 28;
    const right = W - 116;
    const top = 104;
    const priceBottom = hasRsi ? 548 : 660;
    const rsiTop = 580;
    const rsiBottom = 668;
    const slots = candles.length + FUTURE;
    const step = (right - left) / slots;
    const bodyW = Math.max(2, step * 0.62);
    const xAt = (i: number) => left + step * (i + 0.5);

    // Price scale includes every level so TP/SL are always on screen.
    const values = candles.flatMap((c) => [c.high, c.low]);
    if (signal) values.push(signal.stopLoss, signal.takeProfit1, signal.takeProfit2, signal.entry);
    values.push(...marks.map((m) => m.price));
    let min = Math.min(...values);
    let max = Math.max(...values);
    const pad = (max - min) * 0.08 || max * 0.001;
    min -= pad;
    max += pad;
    const yAt = (p: number) => top + ((max - p) / (max - min)) * (priceBottom - top);

    const out: string[] = [];
    out.push(svgOpen(), BRAND_DEFS, background());

    // Watermark
    out.push(`<text x="${(left + right) / 2}" y="${(top + priceBottom) / 2 + 22}" text-anchor="middle" font-size="64" font-weight="800" fill="#FFFFFF" fill-opacity="0.035" letter-spacing="4">MultiAITrading</text>`);

    // Header
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    const change = ((last.close - prev.close) / prev.close) * 100;
    out.push(`<text x="${left}" y="58" font-size="34" font-weight="800" fill="${C.text}" letter-spacing="0.5">${esc(pair)}</text>`);
    const pairW = pair.length * 21 + 14;
    out.push(`<rect x="${left + pairW}" y="31" rx="8" width="58" height="34" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)"/>`);
    out.push(`<text x="${left + pairW + 29}" y="54" text-anchor="middle" font-size="16" font-weight="700" fill="${C.axis}">${TIMEFRAME_LABEL[timeframe]}</text>`);
    out.push(`<text x="${left + pairW + 76}" y="55" font-size="20" font-weight="600" fill="${C.text}">${formatPrice(pair, last.close)}</text>`);
    out.push(`<text x="${left + pairW + 76 + formatPrice(pair, last.close).length * 12 + 10}" y="55" font-size="16" font-weight="600" fill="${change >= 0 ? C.up : C.down}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</text>`);

    if (signal) {
      const color = signal.direction === 'BUY' ? C.up : C.down;
      const label = `${signal.direction === 'BUY' ? '▲' : '▼'} ${signal.direction}`;
      const bx = W - 500;
      out.push(`<rect x="${bx}" y="26" rx="12" width="128" height="44" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.5"/>`);
      out.push(`<text x="${bx + 64}" y="56" text-anchor="middle" font-size="21" font-weight="800" fill="${color}" letter-spacing="1">${label}</text>`);
      if (signal.confidence != null) {
        out.push(`<text x="${bx + 144}" y="44" font-size="12" font-weight="600" fill="${C.axis}" letter-spacing="1">CONFIDENCE</text>`);
        out.push(`<text x="${bx + 144}" y="64" font-size="18" font-weight="800" fill="${C.text}">${signal.confidence}%</text>`);
      }
    }
    out.push(wordmark());
    out.push(`<line x1="${left}" y1="84" x2="${W - 28}" y2="84" stroke="rgba(255,255,255,0.06)"/>`);

    // Grid + price axis
    const ticks = 7;
    for (let i = 0; i <= ticks; i++) {
      const p = min + ((max - min) * i) / ticks;
      const y = yAt(p);
      out.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.grid}"/>`);
      const levels = signal ? [signal.entry, signal.stopLoss, signal.takeProfit1, signal.takeProfit2] : [last.close, ...marks.map((m) => m.price)];
      if (levels.every((l) => Math.abs(yAt(l) - y) > 16)) {
        out.push(`<text x="${right + 12}" y="${y + 4}" font-size="12" fill="${C.axis}">${formatPrice(pair, p)}</text>`);
      }
    }
    // Time axis
    const every = Math.ceil(candles.length / 7);
    for (let i = 0; i < candles.length; i += every) {
      const x = xAt(i);
      const d = new Date(candles[i].time);
      const intraday = timeframe !== '4h';
      const label = intraday
        ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        : `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`;
      out.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${hasRsi ? rsiBottom : priceBottom}" stroke="${C.grid}"/>`);
      out.push(`<text x="${x}" y="${(hasRsi ? rsiBottom : priceBottom) + 22}" text-anchor="middle" font-size="12" fill="${C.axis}">${label}</text>`);
    }

    // Signal zones (drawn under the candles)
    if (signal) {
      const x0 = xAt(candles.length - 1);
      const x1 = right;
      const zone = (a: number, b: number, color: string) =>
        `<rect x="${x0}" y="${Math.min(yAt(a), yAt(b))}" width="${x1 - x0}" height="${Math.abs(yAt(a) - yAt(b))}" fill="${color}" fill-opacity="0.13"/>`;
      out.push(zone(signal.entry, signal.takeProfit2, C.up));
      out.push(zone(signal.entry, signal.stopLoss, C.down));
    }

    // EMAs
    const path = (series: (number | null)[]) => {
      let d = '';
      series.forEach((v, i) => {
        if (v == null) return;
        d += `${d ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      });
      return d;
    };
    if (emaSlow.length) out.push(`<path d="${path(emaSlow)}" fill="none" stroke="${C.emaSlow}" stroke-width="2" stroke-opacity="0.9"/>`);
    if (emaFast.length) out.push(`<path d="${path(emaFast)}" fill="none" stroke="${C.emaFast}" stroke-width="2" stroke-opacity="0.9"/>`);

    // Candles
    candles.forEach((c, i) => {
      const x = xAt(i);
      const color = c.close >= c.open ? C.up : C.down;
      const yo = yAt(c.open);
      const yc = yAt(c.close);
      out.push(`<line x1="${x}" y1="${yAt(c.high)}" x2="${x}" y2="${yAt(c.low)}" stroke="${color}" stroke-width="1.3"/>`);
      out.push(`<rect x="${x - bodyW / 2}" y="${Math.min(yo, yc)}" width="${bodyW}" height="${Math.max(1.2, Math.abs(yo - yc))}" rx="1" fill="${color}"/>`);
    });

    // Levels with tags on the price axis
    const tag = (price: number, label: string, color: string, dashed: boolean) => {
      const y = yAt(price);
      const x0 = signal ? xAt(candles.length - 1) - step * 6 : left;
      out.push(`<line x1="${x0}" y1="${y}" x2="${right - 66}" y2="${y}" stroke="${color}" stroke-width="1.6" ${dashed ? 'stroke-dasharray="6 5"' : ''}/>`);
      out.push(`<line x1="${right - 6}" y1="${y}" x2="${right + 4}" y2="${y}" stroke="${color}" stroke-width="1.6"/>`);
      out.push(`<rect x="${right - 64}" y="${y - 11}" rx="5" width="58" height="22" fill="${C.bg1}"/>`);
      out.push(`<rect x="${right - 64}" y="${y - 11}" rx="5" width="58" height="22" fill="${color}" fill-opacity="0.2" stroke="${color}"/>`);
      out.push(`<text x="${right - 35}" y="${y + 4.5}" text-anchor="middle" font-size="11.5" font-weight="800" fill="${color}">${label}</text>`);
      out.push(`<rect x="${right + 4}" y="${y - 11}" rx="5" width="92" height="22" fill="${color}"/>`);
      out.push(`<text x="${right + 50}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0A0F1E">${formatPrice(pair, price)}</text>`);
    };
    if (signal) {
      tag(signal.takeProfit2, 'TP2', C.up, true);
      tag(signal.takeProfit1, 'TP1', C.up, true);
      tag(signal.stopLoss, 'SL', C.down, true);
      tag(signal.entry, 'ENTRY', C.entry, false);
      // Marker on the entry candle
      const x = xAt(candles.length - 1);
      out.push(`<circle cx="${x}" cy="${yAt(signal.entry)}" r="6" fill="${C.entry}" stroke="#FFFFFF" stroke-width="2"/>`);
    } else {
      for (const m of marks) tag(m.price, esc(m.label.slice(0, 6)), m.price >= last.close ? C.down : C.up, true);
      const y = yAt(last.close);
      out.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${C.entry}" stroke-dasharray="3 4" stroke-opacity="0.7"/>`);
      out.push(`<rect x="${right + 4}" y="${y - 11}" rx="5" width="92" height="22" fill="${C.entry}"/>`);
      out.push(`<text x="${right + 50}" y="${y + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0A0F1E">${formatPrice(pair, last.close)}</text>`);
    }

    // Legend
    if (emaFast.length || emaSlow.length) {
      const [fastLabel, slowLabel] = emaLabels ?? ['EMA fast', 'EMA slow'];
      out.push(`<circle cx="${left + 8}" cy="${top - 4}" r="4" fill="${C.emaFast}"/><text x="${left + 18}" y="${top}" font-size="12" font-weight="600" fill="${C.axis}">${esc(fastLabel)}</text>`);
      out.push(`<circle cx="${left + 98}" cy="${top - 4}" r="4" fill="${C.emaSlow}"/><text x="${left + 108}" y="${top}" font-size="12" font-weight="600" fill="${C.axis}">${esc(slowLabel)}</text>`);
    }

    // RSI panel
    if (hasRsi) {
      const ry = (v: number) => rsiTop + ((100 - v) / 100) * (rsiBottom - rsiTop);
      out.push(`<rect x="${left}" y="${rsiTop}" width="${right - left}" height="${rsiBottom - rsiTop}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" rx="6"/>`);
      out.push(`<rect x="${left}" y="${ry(70)}" width="${right - left}" height="${ry(30) - ry(70)}" fill="#A57BFF" fill-opacity="0.06"/>`);
      for (const lvl of [70, 30]) {
        out.push(`<line x1="${left}" y1="${ry(lvl)}" x2="${right}" y2="${ry(lvl)}" stroke="${C.axis}" stroke-opacity="0.35" stroke-dasharray="4 4"/>`);
        out.push(`<text x="${right + 12}" y="${ry(lvl) + 4}" font-size="11" fill="${C.axis}">${lvl}</text>`);
      }
      let d = '';
      let firstX = 0;
      let lastX = 0;
      rsi.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i);
        if (!d) firstX = x;
        lastX = x;
        d += `${d ? 'L' : 'M'}${x.toFixed(1)},${ry(v).toFixed(1)}`;
      });
      out.push(`<path d="${d}L${lastX},${rsiBottom}L${firstX},${rsiBottom}Z" fill="url(#rsiFill)"/>`);
      out.push(`<path d="${d}" fill="none" stroke="#A57BFF" stroke-width="1.8"/>`);
      const lastRsi = [...rsi].reverse().find((v) => v != null)!;
      out.push(`<text x="${left + 10}" y="${rsiTop + 18}" font-size="12" font-weight="700" fill="${C.axis}">RSI <tspan fill="#C7B0FF">${lastRsi.toFixed(1)}</tspan></text>`);
    }

    out.push(`<text x="${left}" y="${H - 8}" font-size="10.5" fill="${C.axis}" fill-opacity="0.7">Data: Twelve Data • ${new Date(last.time).toISOString().slice(0, 16).replace('T', ' ')} UTC</text>`);
    out.push('</svg>');
    return out.join('\n');
  }
}
