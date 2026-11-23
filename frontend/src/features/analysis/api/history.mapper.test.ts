/** Unit — fault-history and scope-node DTOs → domain model, and the query string sent to the API. */
import { describe, it, expect } from 'vitest'
import { EMPTY_SCOPE } from '../model/history.constants'
import { historyQueryString } from './history.api'
import { toHistorySummary, toScopeNodes } from './history.mapper'

describe('toHistorySummary', () => {
  it('maps the trend, totals and phase distribution', () => {
    const summary = toHistorySummary({
      from: '2026-09-01',
      to: '2026-09-02',
      interval: 'week',
      totals: { fuse_faults: 3, voltage_alarms: 1 },
      series: [{ start: '2026-09-01T05:00:00.000Z', fuse_faults: 3, voltage_alarms: 1 }],
      phase_distribution: { monophasic: 1, biphasic: 1, triphasic: 1 },
    })

    expect(summary).toEqual({
      interval: 'WEEK',
      trend: [{ start: '2026-09-01', fuseOpenings: 3, voltageAbsences: 1 }],
      totals: { fuseOpenings: 3, voltageAbsences: 1 },
      phaseDistribution: { MONOPHASIC: 1, BIPHASIC: 1, TRIPHASIC: 1 },
    })
  })
})

describe('toScopeNodes', () => {
  it('keeps the location of each node and leaves out nodes without a full one', () => {
    const nodes = toScopeNodes({
      count: 2,
      nodes: [
        {
          name: 'ND1',
          zone: { id: 1, name: 'Zona Norte' },
          substation: { id: 2, code: 'SUB', name: 'S/E NORTE 1' },
          circuit: { id: 3, name: 'CTO 1' },
        },
        { name: 'ND2', zone: null, substation: null, circuit: null },
      ],
    })

    expect(nodes).toEqual([
      {
        id: 'ND1',
        zone: { id: '1', name: 'Zona Norte' },
        substation: { id: '2', name: 'S/E NORTE 1' },
        circuit: { id: '3', name: 'CTO 1' },
      },
    ])
  })
})

describe('historyQueryString', () => {
  const range = { from: '2026-09-01', to: '2026-09-27' }

  it('sends only the range when no scope element is chosen', () => {
    expect(historyQueryString(range, EMPTY_SCOPE)).toBe(
      'from=2026-09-01T00%3A00%3A00-05%3A00&to=2026-09-28T00%3A00%3A00-05%3A00'
    )
  })

  it('sends every chosen scope level', () => {
    const scope = { zone: '1', substation: '2', circuit: '3', node: 'ND1' }
    expect(historyQueryString(range, scope)).toBe(
      'from=2026-09-01T00%3A00%3A00-05%3A00&to=2026-09-28T00%3A00%3A00-05%3A00&node=ND1'
    )
  })
})
