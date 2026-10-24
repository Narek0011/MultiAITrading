// Renders the signal chart and its levels with the app's own chart renderer (same as the bot posts).
import { writeFileSync } from 'fs';
import { join } from 'path';
import { computeIndicators } from '../../../src/analysis/indicators';
import { atrLevels } from '../../../src/analysis/levels';
import { ChartRendererService } from '../../../src/charts/chart-renderer.service';
import { demoCandles } from '../../../src/charts/demo-candles';
import { formatPrice, toPips } from '../../../src/common/forex';
import { DEFAULT_SETTINGS } from '../../../src/settings/settings.defaults';

const pair = 'EUR/USD';
const candles = demoCandles();
const indicators = computeIndicators(candles, { ...DEFAULT_SETTINGS.custom, atrPeriod: 14 });
const entry = candles[candles.length - 1].close;
const atr = indicators.atr[indicators.atr.length - 1]!;
const levels = atrLevels(pair, 'BUY', entry, atr, DEFAULT_SETTINGS.risk);
const confidence = 84;

const png = new ChartRendererService().renderPng({
  pair, timeframe: '15min', candles, indicators, emaLabels: ['EMA 21', 'EMA 50'],
  signal: { direction: 'BUY', confidence, ...levels },
});
const out = join(__dirname, '..', 'public');
writeFileSync(join(out, 'chart.png'), png);

const f = (v: number) => formatPrice(pair, v);
const pips = (v: number) => toPips(pair, Math.abs(v - entry));
writeFileSync(join(out, '..', 'src', 'signal.json'), JSON.stringify({
  pair, direction: 'BUY', timeframe: 'M15', confidence,
  entry: f(entry), tp1: f(levels.takeProfit1), tp2: f(levels.takeProfit2), sl: f(levels.stopLoss),
  tp1Pips: pips(levels.takeProfit1), tp2Pips: pips(levels.takeProfit2), slPips: pips(levels.stopLoss),
}, null, 2) + '\n');
console.log('chart.png + signal.json written');
