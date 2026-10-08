/** Unit tests for the data freshness store. */
import { describe, it, expect, beforeEach } from 'vitest'
import { STALE_AFTER_MS, isStale, useDataFreshnessStore } from './dataFreshness.store'

describe('dataFreshness.store', () => {
  beforeEach(() => useDataFreshnessStore.getState().reset())

  it('starts without a sync time', () => {
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBeNull()
  })

  it('records the last sync time', () => {
    // Arrange & Act
    useDataFreshnessStore.getState().markSynced(1_000)

    // Assert
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBe(1_000)
  })

  it('is fresh up to the threshold and stale after it', () => {
    expect(isStale(0, STALE_AFTER_MS)).toBe(false)
    expect(isStale(0, STALE_AFTER_MS + 1)).toBe(true)
  })
})
