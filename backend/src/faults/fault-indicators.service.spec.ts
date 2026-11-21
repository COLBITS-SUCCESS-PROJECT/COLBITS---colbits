import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import {
  FaultIndicatorsQuery,
  FaultIndicatorsService,
  HISTORICAL_FAULT_EVENTS_SQL,
  HistoricalEventRow,
} from './fault-indicators.service';
import { FaultsService } from './faults.service';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const FROM = new Date('2026-11-01T00:00:00.000Z');
const TO = new Date('2026-11-30T23:59:59.000Z');
const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

function baseQuery(
  overrides: Partial<FaultIndicatorsQuery> = {},
): FaultIndicatorsQuery {
  return {
    from: FROM,
    to: TO,
    minDurationFilter: false,
    ...overrides,
  };
}

function row(overrides: Partial<HistoricalEventRow> = {}): HistoricalEventRow {
  return {
    fuses_set_id: 1,
    node_id: '0000100001',
    branch: 'A',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    substation_id: 1,
    substation_code: 'SUB-N-01',
    substation_name: 'S/E NORTE 1',
    fuse_id: '0000100001-A-R',
    phase: 'R',
    event_type: 'SET',
    recorded_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

function serviceWith(
  rows: HistoricalEventRow[],
  options: {
    nodes?: string[];
    groupingWindowMinutes?: number;
    minDurationMinutes?: number;
  } = {},
) {
  const nodes = options.nodes ?? ['0000100001', '0000100002', '0000200001'];
  const builder = {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(nodes.map((name) => ({ name }))),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn().mockResolvedValue(rows),
  };
  const faultsService = {
    getGroupingWindowMinutes: jest
      .fn()
      .mockReturnValue(options.groupingWindowMinutes ?? 5),
    getMinDurationMinutes: jest
      .fn()
      .mockReturnValue(options.minDurationMinutes ?? 1),
  };

  const service = new FaultIndicatorsService(
    repository as unknown as Repository<Node>,
    faultsService as unknown as FaultsService,
  );

  return { service, repository, builder, faultsService };
}

describe('FaultIndicatorsService (US21 · SCRUM-285 F-68/F-70 & SCRUM-286 F-69)', () => {
  it('returns empty indicators without querying alarms for an empty scope (F-10)', async () => {
    const { service, repository } = serviceWith([row()]);

    const result = await service.getIndicators(
      { kind: 'empty' },
      baseQuery(),
      NOW,
    );

    expect(repository.query).not.toHaveBeenCalled();
    expect(result).toEqual({
      generated_at: NOW.toISOString(),
      period: { from: FROM.toISOString(), to: TO.toISOString() },
      minimum_duration_filter: {
        active: false,
        threshold_minutes: 1,
        threshold_seconds: 60,
      },
      total_faults: 0,
      duration: { average_seconds: null, max_seconds: null },
      by_substation: [],
      by_circuit: [],
      node_ranking: [],
      longest_faults: [],
    });
  });

  it('counts exact faults per substation and circuit and ranks nodes and longest faults (F-68, F-70)', async () => {
    // Substation 1 / Circuit 1 / Node 0000100001: 2 faults (120s and 600s)
    // Substation 1 / Circuit 2 / Node 0000100002: 1 fault (300s)
    // Substation 2 / Circuit 3 (also named 'CTO 1') / Node 0000200001: 1 fault (900s)
    const rows: HistoricalEventRow[] = [
      // Fault 1: set 1, 120s (2 min)
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        event_type: 'SET',
        recorded_at: '2026-11-05T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        event_type: 'CLEAR',
        recorded_at: '2026-11-05T10:02:00.000Z',
      }),
      // Fault 2: set 1, 600s (10 min), two phases within 5-min window -> 1 fault
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100001-A-R',
        phase: 'R',
        event_type: 'SET',
        recorded_at: '2026-11-10T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100001-A-S',
        phase: 'S',
        event_type: 'SET',
        recorded_at: '2026-11-10T10:01:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100001-A-R',
        phase: 'R',
        event_type: 'CLEAR',
        recorded_at: '2026-11-10T10:08:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        node_id: '0000100001',
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100001-A-S',
        phase: 'S',
        event_type: 'CLEAR',
        recorded_at: '2026-11-10T10:10:00.000Z',
      }),
      // Fault 3: set 2, Substation 1 / Circuit 2, 300s (5 min)
      row({
        fuses_set_id: 2,
        node_id: '0000100002',
        circuit_id: 2,
        circuit_name: 'CTO 2',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100002-A-R',
        phase: 'R',
        event_type: 'SET',
        recorded_at: '2026-11-12T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 2,
        node_id: '0000100002',
        circuit_id: 2,
        circuit_name: 'CTO 2',
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fuse_id: '0000100002-A-R',
        phase: 'R',
        event_type: 'CLEAR',
        recorded_at: '2026-11-12T10:05:00.000Z',
      }),
      // Fault 4: set 5, Substation 2 / Circuit 3 (also named CTO 1), 900s (15 min)
      row({
        fuses_set_id: 5,
        node_id: '0000200001',
        circuit_id: 3,
        circuit_name: 'CTO 1',
        substation_id: 2,
        substation_code: 'SUB-N-02',
        substation_name: 'S/E NORTE 2',
        fuse_id: '0000200001-R',
        phase: 'R',
        event_type: 'SET',
        recorded_at: '2026-11-15T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 5,
        node_id: '0000200001',
        circuit_id: 3,
        circuit_name: 'CTO 1',
        substation_id: 2,
        substation_code: 'SUB-N-02',
        substation_name: 'S/E NORTE 2',
        fuse_id: '0000200001-R',
        phase: 'R',
        event_type: 'CLEAR',
        recorded_at: '2026-11-15T10:15:00.000Z',
      }),
    ];

    const { service } = serviceWith(rows);
    const result = await service.getIndicators(UNRESTRICTED, baseQuery(), NOW);

    expect(result.total_faults).toBe(4);
    expect(result.by_substation).toEqual([
      {
        substation_id: 1,
        substation_code: 'SUB-N-01',
        substation_name: 'S/E NORTE 1',
        fault_count: 3,
      },
      {
        substation_id: 2,
        substation_code: 'SUB-N-02',
        substation_name: 'S/E NORTE 2',
        fault_count: 1,
      },
    ]);
    // Circuits with the same name ('CTO 1') at different substations stay separate
    expect(result.by_circuit).toEqual([
      {
        circuit_id: 1,
        circuit_name: 'CTO 1',
        substation_id: 1,
        substation_name: 'S/E NORTE 1',
        fault_count: 2,
      },
      {
        circuit_id: 2,
        circuit_name: 'CTO 2',
        substation_id: 1,
        substation_name: 'S/E NORTE 1',
        fault_count: 1,
      },
      {
        circuit_id: 3,
        circuit_name: 'CTO 1',
        substation_id: 2,
        substation_name: 'S/E NORTE 2',
        fault_count: 1,
      },
    ]);
    expect(result.node_ranking.map((n) => [n.node, n.fault_count])).toEqual([
      ['0000100001', 2],
      ['0000100002', 1],
      ['0000200001', 1],
    ]);
    expect(result.longest_faults.map((f) => f.duration_seconds)).toEqual([
      900, 600, 300, 120,
    ]);
    expect(result.duration).toEqual({
      average_seconds: 480,
      max_seconds: 900,
    });
  });

  it('excludes faults <= 1 minute when minimum-duration filter is active and marks filter active (F-69, NF-10)', async () => {
    // 3 faults: 30s (<= 60s), 60s (== 60s, not longer than 1 min), 180s (> 60s), 300s (> 60s)
    const rows: HistoricalEventRow[] = [
      row({
        fuses_set_id: 1,
        event_type: 'SET',
        recorded_at: '2026-11-01T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'CLEAR',
        recorded_at: '2026-11-01T10:00:30.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'SET',
        recorded_at: '2026-11-02T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'CLEAR',
        recorded_at: '2026-11-02T10:01:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'SET',
        recorded_at: '2026-11-03T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'CLEAR',
        recorded_at: '2026-11-03T10:03:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'SET',
        recorded_at: '2026-11-04T10:00:00.000Z',
      }),
      row({
        fuses_set_id: 1,
        event_type: 'CLEAR',
        recorded_at: '2026-11-04T10:05:00.000Z',
      }),
    ];

    const { service } = serviceWith(rows, { minDurationMinutes: 1 });

    const unfiltered = await service.getIndicators(
      UNRESTRICTED,
      baseQuery({ minDurationFilter: false }),
      NOW,
    );
    expect(unfiltered.minimum_duration_filter).toEqual({
      active: false,
      threshold_minutes: 1,
      threshold_seconds: 60,
    });
    expect(unfiltered.total_faults).toBe(4);
    expect(unfiltered.duration).toEqual({
      average_seconds: 142.5,
      max_seconds: 300,
    });

    const filtered = await service.getIndicators(
      UNRESTRICTED,
      baseQuery({ minDurationFilter: true }),
      NOW,
    );
    expect(filtered.minimum_duration_filter).toEqual({
      active: true,
      threshold_minutes: 1,
      threshold_seconds: 60,
    });
    expect(filtered.total_faults).toBe(2);
    expect(filtered.duration).toEqual({
      average_seconds: 240,
      max_seconds: 300,
    });
  });

  it('applies user scope and optional hierarchical filters in SQL (F-10, F-65)', async () => {
    const { service, builder } = serviceWith([], { nodes: ['0000100001'] });

    await service.getIndicators(
      { kind: 'restricted', userId: 7 },
      baseQuery({ zoneId: 1, substationId: 1, circuitId: 1, nodeId: '0000100001' }),
      NOW,
    );

    expect(builder.setParameter).toHaveBeenCalledWith('scopeUserId', 7);
    expect(builder.andWhere).toHaveBeenCalledWith(
      'node.name = :filterNodeId',
      { filterNodeId: '0000100001' },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'node.circuit_id = :filterCircuitId',
      { filterCircuitId: 1 },
    );
  });

  it('SQL references $1 through $4 and no other parameter', () => {
    const placeholders = [
      ...HISTORICAL_FAULT_EVENTS_SQL.matchAll(/\$(\d+)/g),
    ].map((match) => Number(match[1]));
    expect([...new Set(placeholders)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
