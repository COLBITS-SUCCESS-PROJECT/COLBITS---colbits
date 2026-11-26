/** Unit — fault-indicator DTO → domain model, and the query string sent to the API (F-68 to F-70). */
import { describe, it, expect } from 'vitest'
import { ALL, EMPTY_SCOPE } from '../model/history.constants'
import { indicatorsQueryString } from './indicators.api'
import type {
  CircuitContextDto,
  FaultIndicatorsResponseDto,
  LongestFaultDto,
} from './indicators.dto'
import { toFaultIndicators } from './indicators.mapper'

const NORTH_CTO_1 = {
  circuit_id: 1,
  circuit_name: 'CTO 1',
  substation_id: 1,
  substation_name: 'S/E NORTE 1',
}
const NORTH_CTO_2 = {
  circuit_id: 2,
  circuit_name: 'CTO 2',
  substation_id: 1,
  substation_name: 'S/E NORTE 1',
}
const SOUTH_CTO_1 = {
  circuit_id: 3,
  circuit_name: 'CTO 1',
  substation_id: 2,
  substation_name: 'S/E SUR 1',
}

function fault(
  node: string,
  circuit: CircuitContextDto,
  startedAt: string,
  seconds: number,
  overrides: Partial<LongestFaultDto> = {}
): LongestFaultDto {
  return {
    id: `1:${startedAt}`,
    node,
    ...circuit,
    fuses_set_id: 1,
    branch: 'A',
    classification: 'MONOPHASIC',
    phases: ['R'],
    state: 'RESOLVED',
    started_at: startedAt,
    ended_at: startedAt,
    duration_seconds: seconds,
    ...overrides,
  }
}

const DTO: FaultIndicatorsResponseDto = {
  generated_at: '2026-11-19T15:00:00.000Z',
  period: { from: '2026-10-19T05:00:00.000Z', to: '2026-11-20T04:59:59.999Z' },
  minimum_duration_filter: { active: true, threshold_minutes: 1, threshold_seconds: 60 },
  total_faults: 4,
  duration: { average_seconds: 1500.5, max_seconds: 3600 },
  by_substation: [
    {
      substation_id: 1,
      substation_code: 'SUB-N-001',
      substation_name: 'S/E NORTE 1',
      fault_count: 3,
    },
    {
      substation_id: 2,
      substation_code: 'SUB-S-001',
      substation_name: 'S/E SUR 1',
      fault_count: 1,
    },
  ],
  by_circuit: [
    { ...NORTH_CTO_1, fault_count: 2 },
    { ...NORTH_CTO_2, fault_count: 1 },
    { ...SOUTH_CTO_1, fault_count: 1 },
  ],
  node_ranking: [
    { ...NORTH_CTO_1, node: 'ND01', fault_count: 2 },
    { ...NORTH_CTO_2, node: 'ND02', fault_count: 1 },
    { ...SOUTH_CTO_1, node: 'ND03', fault_count: 1 },
  ],
  longest_faults: [
    fault('ND01', NORTH_CTO_1, '2026-11-01T10:00:00.000Z', 3600),
    fault('ND03', SOUTH_CTO_1, '2026-11-02T10:00:00.000Z', 840, {
      classification: null,
      phases: null,
      state: 'OPEN',
      ended_at: null,
    }),
    fault('ND01', NORTH_CTO_1, '2026-11-05T08:00:00.000Z', 300),
    fault('ND02', NORTH_CTO_2, '2026-10-30T08:00:00.000Z', 120),
  ],
}

describe('toFaultIndicators', () => {
  it('maps the counts by substation and circuit (F-68)', () => {
    const indicators = toFaultIndicators(DTO)

    expect(indicators.bySubstation).toEqual([
      { id: '1', label: 'S/E NORTE 1', count: 3 },
      { id: '2', label: 'S/E SUR 1', count: 1 },
    ])
    expect(indicators.byCircuit.map(({ label, count }) => [label, count])).toEqual([
      ['CTO 1 · S/E NORTE 1', 2],
      ['CTO 2', 1],
      ['CTO 1 · S/E SUR 1', 1],
    ])
  })

  it('maps the durations and the minimum-duration filter as applied (F-69)', () => {
    const indicators = toFaultIndicators(DTO)

    expect(indicators).toMatchObject({
      totalFaults: 4,
      averageSeconds: 1500.5,
      maxSeconds: 3600,
      minimumDuration: { isActive: true, thresholdSeconds: 60 },
    })
  })

  it('ranks the nodes with the start of their latest fault, and keeps the order of the faults (F-70)', () => {
    const indicators = toFaultIndicators(DTO)

    expect(
      indicators.nodeRanking.map(({ node, faults, lastFaultAt }) => [node, faults, lastFaultAt])
    ).toEqual([
      ['ND01', 2, '2026-11-05T08:00:00.000Z'],
      ['ND02', 1, '2026-10-30T08:00:00.000Z'],
      ['ND03', 1, '2026-11-02T10:00:00.000Z'],
    ])
    expect(
      indicators.longestFaults.map(({ node, durationSeconds }) => [node, durationSeconds])
    ).toEqual([
      ['ND01', 3600],
      ['ND03', 840],
      ['ND01', 300],
      ['ND02', 120],
    ])
    expect(indicators.longestFaults[1]).toMatchObject({
      circuit: 'CTO 1 · S/E SUR 1',
      classification: null,
      isOpen: true,
    })
  })

  it('has no last fault for a node missing from the fault list', () => {
    const indicators = toFaultIndicators({ ...DTO, longest_faults: [] })

    expect(indicators.nodeRanking[0]?.lastFaultAt).toBeNull()
  })
})

describe('indicatorsQueryString', () => {
  const RANGE = { from: '2026-10-19', to: '2026-11-19' }
  const paramsOf = (...args: Parameters<typeof indicatorsQueryString>) =>
    Object.fromEntries(new URLSearchParams(indicatorsQueryString(...args)))

  it('sends both days as inclusive instants in Bogotá and leaves the filter off by default', () => {
    expect(paramsOf(RANGE, EMPTY_SCOPE, false)).toEqual({
      from: '2026-10-19T00:00:00-05:00',
      to: '2026-11-19T23:59:59.999-05:00',
    })
  })

  it('sends only the deepest selected scope element, the node as node_id', () => {
    const scope = { zone: '1', substation: '1', circuit: '1', node: 'ND01' }

    expect(paramsOf(RANGE, scope, false)).toMatchObject({ node_id: 'ND01' })
    expect(paramsOf(RANGE, scope, false)).not.toHaveProperty('circuit_id')
    expect(paramsOf(RANGE, { ...scope, node: ALL }, false)).toMatchObject({ circuit_id: '1' })
    expect(paramsOf(RANGE, { ...scope, node: ALL }, false)).not.toHaveProperty('zone_id')
  })

  it('turns the minimum-duration filter on', () => {
    expect(paramsOf(RANGE, EMPTY_SCOPE, true)).toMatchObject({ min_duration_filter: 'true' })
  })
})
