/** Unit tests for the node detail mapper — input is exactly what backend/src/nodes/node-detail.service.ts returns. */
import { describe, it, expect } from 'vitest'
import type { FuseDetailDto, NodeDetailResponseDto } from './nodeDetail.dto'
import { toNodeDetail } from './nodeDetail.mapper'

const FUSE: FuseDetailDto = {
  id: '0000300008-A-R',
  phase: 'R',
  hw_id: '1301000058',
  fuse_state: 'Cerrado',
  is_voltage_present: true,
  inactive: false,
  supercaps_per: 100,
  solar_panel: 13.9,
  recorded_at: '2026-10-29T14:16:35.000Z',
}

const DETAIL: NodeDetailResponseDto = {
  node: '0000300008',
  circuit: { id: 3, name: 'CTO 1' },
  substation: { id: 2, code: 'SUB-N-002', name: 'S/E NORTE 2' },
  fuse_sets: [{ id: 30, set_id: 'A', client_count: 24, fuses: [FUSE] }],
  transformers: [
    {
      id: '0000300008-T1-1',
      hw_id: '0501000003',
      inactive: false,
      battery_per: 92,
      voltages: { va: 127.1, vb: 126.8, vc: null },
      recorded_at: '2026-10-29T14:20:00.000Z',
    },
  ],
}

describe('toNodeDetail', () => {
  it('maps the node, its location, sets, fuses and transformer to the domain model', () => {
    // Arrange & Act
    const detail = toNodeDetail(DETAIL)

    // Assert
    expect(detail.nodeId).toBe('0000300008')
    expect(detail.circuit).toEqual({ id: 3, name: 'CTO 1' })
    expect(detail.substation.name).toBe('S/E NORTE 2')
    expect(detail.fuseSets[0]).toMatchObject({ id: 30, branch: 'A', clientCount: 24 })
    expect(detail.fuseSets[0].fuses[0]).toEqual({
      id: '0000300008-A-R',
      phase: 'R',
      deviceId: '1301000058',
      state: 'CLOSED',
      hasVoltage: true,
      isInactive: false,
      supercapsPercent: 100,
      solarPanel: 13.9,
      lastRecordAt: new Date('2026-10-29T14:16:35.000Z'),
    })
    expect(detail.transformers[0]).toEqual({
      id: '0000300008-T1-1',
      deviceId: '0501000003',
      isInactive: false,
      batteryPercent: 92,
      voltages: { a: 127.1, b: 126.8, c: null },
      lastRecordAt: new Date('2026-10-29T14:20:00.000Z'),
    })
  })

  it.each([
    ['Abierto', 'OPEN'],
    ['Cerrado', 'CLOSED'],
    [null, 'UNKNOWN'],
  ])('maps the stored fuse state %p to %s', (stored, expected) => {
    const detail = toNodeDetail({
      ...DETAIL,
      fuse_sets: [{ ...DETAIL.fuse_sets[0], fuses: [{ ...FUSE, fuse_state: stored }] }],
    })

    expect(detail.fuseSets[0].fuses[0].state).toBe(expected)
  })

  it('keeps missing values as null, and no transformer as an empty list', () => {
    const detail = toNodeDetail({
      ...DETAIL,
      fuse_sets: [
        {
          id: 1,
          set_id: null,
          client_count: null,
          fuses: [{ ...FUSE, recorded_at: null, supercaps_per: null }],
        },
      ],
      transformers: [],
    })

    expect(detail.fuseSets[0]).toMatchObject({ branch: null, clientCount: null })
    expect(detail.fuseSets[0].fuses[0]).toMatchObject({
      lastRecordAt: null,
      supercapsPercent: null,
    })
    expect(detail.transformers).toEqual([])
  })
})
