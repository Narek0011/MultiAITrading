import { pickBest } from './pick-best';

const min = () => 70;
const idea = (pair: string, confidence: number) => ({ pair, confidence, mode: 'AI' });

describe('pickBest', () => {
  it('takes the most confident idea that passes the threshold', () => {
    expect(pickBest([idea('A', 72), idea('B', 90), idea('C', 60)], 1, min)).toEqual({ picks: [idea('B', 90)], belowMin: false });
  });

  it('never prefers a below-threshold idea over one that passes', () => {
    expect(pickBest([idea('A', 71), idea('C', 69)], 2, min).picks.map((i) => i.pair)).toEqual(['A']);
  });

  it('falls back to the best idea under the threshold when none passes', () => {
    expect(pickBest([idea('A', 58), idea('B', 66)], 1, min)).toEqual({ picks: [idea('B', 66)], belowMin: true });
  });

  it('returns nothing when there are no ideas', () => {
    expect(pickBest([], 1, min)).toEqual({ picks: [], belowMin: false });
  });
});
