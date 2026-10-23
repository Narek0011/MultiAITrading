import { demoCandles } from '../charts/demo-candles';
import { DEFAULT_SETTINGS } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';
import { IndicatorStrategy, voteIndicators } from './indicator.strategy';
import { computeIndicators, IndicatorSeries } from './indicators';
import { levelsAreValid } from './levels';

const cfg = DEFAULT_SETTINGS.custom;
const series = (o: Partial<Record<keyof IndicatorSeries, (number | null)[]>>): IndicatorSeries => ({
  emaFast: [], emaSlow: [], rsi: [], macdHist: [], atr: [], ...o,
});

describe('voteIndicators', () => {
  it('counts a bullish EMA cross + rising MACD + rising RSI as 3 fresh bull votes', () => {
    const v = voteIndicators(
      series({ emaFast: [1.0, 1.0, 1.2], emaSlow: [1.1, 1.1, 1.1], macdHist: [-0.1, 0.05, 0.1], rsi: [48, 52, 58] }),
      cfg,
    );
    expect(v.bull).toHaveLength(3);
    expect(v.freshBull).toBe(true);
    expect(v.bear).toHaveLength(0);
  });

  it('never votes BUY when RSI is overbought', () => {
    const v = voteIndicators(series({ emaFast: [1, 1, 1.2], emaSlow: [1.1, 1.1, 1.1], macdHist: [0.1, 0.2, 0.3], rsi: [70, 75, 80] }), cfg);
    expect(v.bull).toHaveLength(0);
  });

  it('detects bearish confluence', () => {
    const v = voteIndicators(
      series({ emaFast: [1.2, 1.2, 1.0], emaSlow: [1.1, 1.1, 1.1], macdHist: [0.1, -0.05, -0.1], rsi: [52, 48, 42] }),
      cfg,
    );
    expect(v.bear).toHaveLength(3);
    expect(v.freshBear).toBe(true);
  });
});

describe('IndicatorStrategy', () => {
  const settings = { get: (g: keyof typeof DEFAULT_SETTINGS) => DEFAULT_SETTINGS[g] } as unknown as SettingsService;
  const strategy = new IndicatorStrategy(settings);

  it('returns valid ATR levels whenever it signals', async () => {
    let signals = 0;
    for (let seed = 1; seed < 60; seed++) {
      const candles = demoCandles(200, 1.08, 15 * 60_000, seed);
      const indicators = computeIndicators(candles, { ...cfg, atrPeriod: 14 });
      const idea = await strategy.analyze({ pair: 'EUR/USD', timeframe: '15min', language: 'en', candles, indicators });
      if (idea.direction === 'NONE') continue;
      signals++;
      expect(levelsAreValid(idea.direction, idea)).toBe(true);
      expect(idea.confidence).toBeGreaterThanOrEqual(55);
    }
    expect(signals).toBeGreaterThan(0);
  });
});
