import { Direction } from '../common/types';
import { roundPrice } from '../common/forex';
import { RiskSettings } from '../settings/settings.types';

export function atrLevels(pair: string, direction: Direction, entry: number, atr: number, risk: RiskSettings) {
  const sign = direction === 'BUY' ? 1 : -1;
  const distance = atr * risk.slAtrMultiplier;
  return {
    entry: roundPrice(pair, entry),
    stopLoss: roundPrice(pair, entry - sign * distance),
    takeProfit1: roundPrice(pair, entry + sign * distance * risk.tp1RiskReward),
    takeProfit2: roundPrice(pair, entry + sign * distance * risk.tp2RiskReward),
  };
}

/** True when SL is on the losing side and both TPs on the winning side, in order. */
export function levelsAreValid(direction: Direction, l: { entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number }) {
  return direction === 'BUY'
    ? l.stopLoss < l.entry && l.entry < l.takeProfit1 && l.takeProfit1 <= l.takeProfit2
    : l.stopLoss > l.entry && l.entry > l.takeProfit1 && l.takeProfit1 >= l.takeProfit2;
}
