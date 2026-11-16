/** Unit tests for the TEMPORARY merge of the alarms GET /faults does not list yet. */
import { describe, it, expect } from 'vitest'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import type { FaultAlert } from './liveMonitoring.types'
import { mergeTemporaryAlarms } from './temporaryAlarms.rules'

const NOW = new Date(2026, 10, 16, 10, 0).getTime()
const [fuse] = buildLiveMonitoringMock(NOW).faults as [FaultAlert, ...FaultAlert[]]
const lowEnergy: FaultAlert = { ...fuse, id: 'LOW_ENERGY:S-1:t', type: 'LOW_ENERGY' }
const inactivity: FaultAlert = { ...fuse, id: 'DEVICE_INACTIVITY:H-1:t', type: 'DEVICE_INACTIVITY' }

describe('mergeTemporaryAlarms', () => {
  it('keeps the fault service alarms first, in their order, then the merged ones', () => {
    expect(mergeTemporaryAlarms([fuse], [lowEnergy], [inactivity])).toEqual([
      fuse,
      lowEnergy,
      inactivity,
    ])
  })

  it('drops a merged type as soon as the fault service lists it, so nothing shows twice', () => {
    const fromBackend: FaultAlert = { ...lowEnergy, id: 'LOW_ENERGY:S-2:t' }

    expect(mergeTemporaryAlarms([fuse, fromBackend], [lowEnergy], [inactivity])).toEqual([
      fuse,
      fromBackend,
      inactivity,
    ])
  })

  it('drops a merged alarm whose id the fault service already sent', () => {
    const sameId: FaultAlert = { ...fuse, id: lowEnergy.id }

    expect(mergeTemporaryAlarms([sameId], [lowEnergy])).toEqual([sameId])
  })

  it('returns only the merged alarms when the fault service has none', () => {
    expect(mergeTemporaryAlarms([], [lowEnergy])).toEqual([lowEnergy])
  })
})
