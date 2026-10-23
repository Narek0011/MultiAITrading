import { evaluateSignal, TrackedSignal } from './result-evaluator';

const c = (high: number, low: number) => ({ time: 0, open: (high + low) / 2, close: (high + low) / 2, high, low });
const buy: TrackedSignal = { direction: 'BUY', entry: 1.1, stopLoss: 1.099, takeProfit1: 1.101, takeProfit2: 1.102, tp1Hit: false };
const sell: TrackedSignal = { direction: 'SELL', entry: 1.1, stopLoss: 1.101, takeProfit1: 1.099, takeProfit2: 1.098, tp1Hit: false };

describe('evaluateSignal', () => {
  it('stays open while price is between levels', () => {
    expect(evaluateSignal(buy, [c(1.1005, 1.0995)], true)).toEqual({ events: [], tp1Hit: false, closed: false });
  });

  it('BUY: TP1 then TP2 closes the trade', () => {
    const r = evaluateSignal(buy, [c(1.1012, 1.0998), c(1.1021, 1.1005)], true);
    expect(r).toEqual({ events: ['TP1', 'TP2'], tp1Hit: true, closed: true });
  });

  it('BUY: stop loss closes as SL', () => {
    expect(evaluateSignal(buy, [c(1.1004, 1.0989)], true)).toEqual({ events: ['SL'], tp1Hit: false, closed: true });
  });

  it('assumes the stop came first when one candle touches both', () => {
    expect(evaluateSignal(buy, [c(1.1015, 1.0985)], true).events).toEqual(['SL']);
  });

  it('after TP1 a return to entry closes at breakeven', () => {
    const r = evaluateSignal(buy, [c(1.1011, 1.1001), c(1.1005, 1.0999)], true);
    expect(r).toEqual({ events: ['TP1', 'BE'], tp1Hit: true, closed: true });
  });

  it('without breakeven, after TP1 the original stop still applies', () => {
    const r = evaluateSignal(buy, [c(1.1011, 1.1001), c(1.1005, 1.0999)], false);
    expect(r).toEqual({ events: ['TP1'], tp1Hit: true, closed: false });
  });

  it('continues from a signal that already hit TP1', () => {
    const r = evaluateSignal({ ...buy, tp1Hit: true }, [c(1.1025, 1.1004)], true);
    expect(r.events).toEqual(['TP2']);
  });

  it('SELL mirrors the logic', () => {
    expect(evaluateSignal(sell, [c(1.1002, 1.0988), c(1.0995, 1.0979)], true).events).toEqual(['TP1', 'TP2']);
    expect(evaluateSignal(sell, [c(1.1011, 1.0999)], true).events).toEqual(['SL']);
  });
});
