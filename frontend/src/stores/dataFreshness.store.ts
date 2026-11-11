/** Data freshness — when the map last refreshed successfully (F-32) and whether its refresh is failing (F-31), shown by the Top Bar. */
import { create } from 'zustand'

/** PROVISIONAL — data older than this is "stale" (open question Q3 in docs/specs/dashboard/FEATURE.md). */
export const STALE_AFTER_MS = 5 * 60 * 1000

interface DataFreshnessState {
  /** Epoch ms of the last successful map refresh (`GET /nodes`), or null before the first one. */
  lastSyncedAt: number | null
  /** True while the map shows nodes but its automatic refresh fails or waits for the network (F-31). */
  isInterrupted: boolean
  markSynced: (at: number) => void
  setInterrupted: (isInterrupted: boolean) => void
  reset: () => void
}

export const useDataFreshnessStore = create<DataFreshnessState>((set) => ({
  lastSyncedAt: null,
  isInterrupted: false,
  markSynced: (at) => set({ lastSyncedAt: at }),
  setInterrupted: (isInterrupted) => set({ isInterrupted }),
  reset: () => set({ lastSyncedAt: null, isInterrupted: false }),
}))

export function isStale(lastSyncedAt: number, now: number): boolean {
  return now - lastSyncedAt > STALE_AFTER_MS
}
