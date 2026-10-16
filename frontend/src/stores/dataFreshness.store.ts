/** Data freshness — when live data was last received, shown by the Top Bar as Live / Stale. */
import { create } from 'zustand'

/** PROVISIONAL — data older than this is "stale" (open question Q3 in docs/specs/dashboard/FEATURE.md). */
export const STALE_AFTER_MS = 5 * 60 * 1000

interface DataFreshnessState {
  /** Epoch ms of the last successful live-data response, or null before the first one. */
  lastSyncedAt: number | null
  markSynced: (at: number) => void
  reset: () => void
}

export const useDataFreshnessStore = create<DataFreshnessState>((set) => ({
  lastSyncedAt: null,
  markSynced: (at) => set({ lastSyncedAt: at }),
  reset: () => set({ lastSyncedAt: null }),
}))

export function isStale(lastSyncedAt: number, now: number): boolean {
  return now - lastSyncedAt > STALE_AFTER_MS
}
