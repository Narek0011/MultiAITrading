import { computeIndicators } from '../analysis/indicators';
import { ChartRendererService } from './chart-renderer.service';
import { demoCandles } from './demo-candles';

describe('ChartRendererService', () => {
  const renderer = new ChartRendererService();
  const candles = demoCandles();
  const indicators = computeIndicators(candles, { rsiPeriod: 14, emaFast: 21, emaSlow: 50, macdFast: 12, macdSlow: 26, macdSignal: 9, atrPeriod: 14 });

  it('renders a PNG with signal levels', () => {
    const last = candles[candles.length - 1].close;
    const png = renderer.renderPng({
      pair: 'EUR/USD', timeframe: '15min', candles, indicators,
      signal: { direction: 'SELL', entry: last, stopLoss: last + 0.001, takeProfit1: last - 0.001, takeProfit2: last - 0.002, confidence: 77 },
    });
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.length).toBeGreaterThan(50_000);
  });

  it('escapes the pair name and draws all levels in SVG', () => {
    const svg = renderer.renderSvg({
      pair: 'GBP/JPY', timeframe: '1h', candles,
      signal: { direction: 'BUY', entry: 1, stopLoss: 0.9, takeProfit1: 1.1, takeProfit2: 1.2 },
    });
    for (const label of ['ENTRY', 'TP1', 'TP2', 'SL', 'H1', 'BUY']) expect(svg).toContain(label);
  });
});
