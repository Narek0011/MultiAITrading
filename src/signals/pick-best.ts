/**
 * The `limit` most confident ideas. Ideas that pass the normal threshold (`minFor`) win; only when none do,
 * the best of the rest is used (they already passed the floor when they were evaluated).
 */
export function pickBest<T extends { confidence: number; mode: string }>(ideas: T[], limit: number, minFor: (mode: string) => number): { picks: T[]; belowMin: boolean } {
  const sorted = [...ideas].sort((a, b) => b.confidence - a.confidence);
  const strong = sorted.filter((i) => i.confidence >= minFor(i.mode));
  const picks = (strong.length ? strong : sorted).slice(0, Math.max(0, limit));
  return { picks, belowMin: !strong.length && picks.length > 0 };
}
