import { writeFileSync } from 'fs';
import { ChartRendererService } from '../src/charts/chart-renderer.service';
import { demoCandles } from '../src/charts/demo-candles';
import { computeIndicators } from '../src/analysis/indicators';
import { atrLevels } from '../src/analysis/levels';
import { DEFAULT_SETTINGS } from '../src/settings/settings.defaults';

const candles = demoCandles();
const c = DEFAULT_SETTINGS.custom;
const ind = computeIndicators(candles, { ...c, atrPeriod: 14 });
const entry = candles[candles.length - 1].close;
const atr = ind.atr[ind.atr.length - 1]!;
const lv = atrLevels('EUR/USD', 'BUY', entry, atr, DEFAULT_SETTINGS.risk);
const png = new ChartRendererService().renderPng({
  pair: 'EUR/USD', timeframe: '15min', candles, indicators: ind, emaLabels: ['EMA 21', 'EMA 50'],
  signal: { direction: 'BUY', confidence: 82, ...lv },
});
writeFileSync(process.argv[2] ?? 'sample.png', png);
console.log('ok', png.length);
