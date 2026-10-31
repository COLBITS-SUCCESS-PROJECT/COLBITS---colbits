/** Unit tests for the fault DTO → domain mapper. */
import { describe, it, expect } from 'vitest'
import type { ActiveFaultDto } from './faults.dto'
import { toFaultAlert, toFaultAlerts } from './faults.mapper'

const STARTED_AT = '2026-10-29T15:05:00.000Z'

const DTO: ActiveFaultDto = {
  id: `2:${STARTED_AT}`,
  node: '0000100002',
  circuit: { id: 1, name: 'CTO 1' },
  fuses_set_id: 2,
  branch: 'B',
  alert_type: 'FUSE_OPENING',
  state: 'OPEN',
  phases: ['R', 'S'],
  classification: 'BIPHASIC',
  client_count: 80,
  started_at: STARTED_AT,
  ended_at: null,
  duration_seconds: 930,
  openings: [
    { fuse_id: '0000100002-B-R', phase: 'R', opened_at: STARTED_AT, closed_at: null },
    { fuse_id: '0000100002-B-S1', phase: 'S1', opened_at: STARTED_AT, closed_at: null },
  ],
  warnings: [],
}

describe('toFaultAlert', () => {
  it('maps every field the fault card shows (F-51, F-55)', () => {
    // Arrange & Act
    const fault = toFaultAlert(DTO)

    // Assert
    expect(fault).toEqual({
      id: `2:${STARTED_AT}`,
      device: 'FALCON',
      type: 'FUSE_OPENING',
      severity: 'CRITICAL',
      status: 'OPEN',
      nodeId: '0000100002',
      zone: null,
      substation: null,
      circuit: 'CTO 1',
      branch: 'B',
      phases: { R: 'CRITICAL', S: 'CRITICAL', T: 'OK' },
      classification: 'BIPHASIC',
      startedAt: new Date(STARTED_AT),
      durationMinutes: 15,
      customersAffected: 80,
      transformerLoad: null,
    })
  })

  it('keeps a missing client count as unknown instead of 0', () => {
    expect(toFaultAlert({ ...DTO, client_count: null }).customersAffected).toBeNull()
  })

  it('keeps a node with a single fuse set without branch', () => {
    expect(toFaultAlert({ ...DTO, branch: null }).branch).toBeNull()
  })

  it('does not draw phases it cannot classify, and keeps the classification empty', () => {
    const fault = toFaultAlert({
      ...DTO,
      phases: null,
      classification: null,
      warnings: ['PHASES_UNCLASSIFIED'],
    })

    expect(fault.phases).toBeNull()
    expect(fault.classification).toBeNull()
  })

  it('never maps the legacy I · C · D phases to R · S · T, but keeps their classification', () => {
    const fault = toFaultAlert({ ...DTO, phases: ['I', 'C'], classification: 'BIPHASIC' })

    expect(fault.phases).toBeNull()
    expect(fault.classification).toBe('BIPHASIC')
  })

  it('draws no phases for an empty list', () => {
    expect(toFaultAlert({ ...DTO, phases: [] }).phases).toBeNull()
  })
})

describe('toFaultAlerts', () => {
  it('maps every fault of the response in the order received', () => {
    const second = { ...DTO, id: 'second', node: '0000100003' }

    const faults = toFaultAlerts({ generated_at: STARTED_AT, count: 2, faults: [DTO, second] })

    expect(faults.map((fault) => fault.nodeId)).toEqual(['0000100002', '0000100003'])
  })

  it('returns an empty list when there are no open faults', () => {
    expect(toFaultAlerts({ generated_at: STARTED_AT, count: 0, faults: [] })).toEqual([])
  })
})
