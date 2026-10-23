export interface Candle {
  time: number; // unix ms, candle open time (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Direction = 'BUY' | 'SELL';

export interface TradeIdea {
  direction: Direction | 'NONE';
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  reasoning: string;
}
