export type AiState = 'live' | 'standby' | 'offline';

export interface AiStatus {
  state: AiState;
  lastScanAt: string | null;
  analysesToday: number;
  pairsMonitored: number;
  signalsTotal: number;
  winRate: number | null;
}

/**
 * Public, aggregate-only view of the bot for the landing page.
 * Deliberately contains no signal levels, pairs with open trades or strategy details.
 */
export function buildAiStatus(input: {
  botEnabled: boolean;
  scanIntervalMinutes: number;
  lastScanAt: Date | null;
  analysesToday: number;
  pairsMonitored: number;
  stats: { total: number; winRate: number | null };
  now?: number;
}): AiStatus {
  const now = input.now ?? Date.now();
  const recent = !!input.lastScanAt && now - input.lastScanAt.getTime() < 3 * input.scanIntervalMinutes * 60_000;
  return {
    state: !input.botEnabled ? 'offline' : recent ? 'live' : 'standby',
    lastScanAt: input.lastScanAt?.toISOString() ?? null,
    analysesToday: input.analysesToday,
    pairsMonitored: input.pairsMonitored,
    signalsTotal: input.stats.total,
    winRate: input.stats.winRate,
  };
}
