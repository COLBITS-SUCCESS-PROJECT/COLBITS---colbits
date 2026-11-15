import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import {
  ACTIVE_FAULT_EVENTS_SQL,
  ActiveFaultsService,
} from './active-faults.service';
import {
  FREE_FALL_ALERT_PARAMETERS,
  FREE_FALL_ALERTS_SQL,
  FalconAlertRow,
  OVERLOAD_ALERTS_SQL,
  OverloadAlertRow,
  SOLAR_PANEL_ALERTS_SQL,
} from './device-alert-queries';
import {
  DeviceAlertThresholds,
  ResolvedDeviceAlertThresholds,
} from './device-alert-thresholds';
import { ALERT_TYPE_DEFINITIONS, ALERT_TYPES } from './fault-alert-types';
import { DEFAULT_SEVERITY_WEIGHTS, SeverityWeights } from './fault-ordering';
import { FaultsService } from './faults.service';
import {
  ACTIVE_SOURCE_ALARMS_SQL,
  RESOLVED_SOURCE_ALARMS_SQL,
  SOURCE_ALARM_PATTERNS,
  SourceAlarmEpisodeRow,
  SourceAlarmRow,
} from './source-alarms';

const NOW = new Date('2026-10-29T15:20:00.000Z');
const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

const minutesAgo = (minutes: number, seconds = 0): Date =>
  new Date(NOW.getTime() - minutes * 60_000 - seconds * 1000);

interface Row {
  fuses_set_id: number | string;
  node_id: string;
  branch: string | null;
  client_count: number | string | null;
  circuit_id: number | string;
  circuit_name: string;
  fuse_id: string;
  phase: string;
  event_code: string;
  event_type: string;
  recorded_at: Date | string;
}

/** A fuse-opening event of fuse set 2 (node 0000100002, branch A, 120 clients) unless overridden. */
function row(overrides: Partial<Row> = {}): Row {
  return {
    fuses_set_id: 2,
    node_id: '0000100002',
    branch: 'A',
    client_count: 120,
    circuit_id: 1,
    circuit_name: 'CTO 1',
    fuse_id: '0000100002-A-R',
    phase: 'R',
    event_code: '131420',
    event_type: 'SET',
    recorded_at: minutesAgo(15),
    ...overrides,
  };
}

/** An active loss-of-voltage alarm on fuse 0000100002-A-R unless overridden. */
function sourceRow(overrides: Partial<SourceAlarmRow> = {}): SourceAlarmRow {
  return {
    event_code: '131421',
    started_at: minutesAgo(20),
    source_id: '0000100002-A-R',
    node_id: '0000100002',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    fuses_set_id: 2,
    branch: 'A',
    phase: 'R',
    ...overrides,
  };
}

/** An active SMAC phase alarm on transformer 0000100002-T1-3 unless overridden. */
function smacRow(overrides: Partial<SourceAlarmRow> = {}): SourceAlarmRow {
  return sourceRow({
    event_code: '051421A',
    source_id: '0000100002-T1-3',
    fuses_set_id: null,
    branch: null,
    phase: null,
    ...overrides,
  });
}

const DEFAULT_THRESHOLDS: ResolvedDeviceAlertThresholds = {
  thresholds: {
    overloadPercent: 90,
    voltageUnbalancePercent: 2,
    currentUnbalancePercent: null,
  } satisfies DeviceAlertThresholds,
  warnings: [],
};

function serviceWith(
  rows: Row[],
  options: {
    nodes?: string[];
    window?: number;
    weights?: SeverityWeights;
    sourceRows?: SourceAlarmRow[];
    resolvedRows?: SourceAlarmEpisodeRow[];
    freeFallRows?: FalconAlertRow[];
    solarRows?: FalconAlertRow[];
    overloadRows?: OverloadAlertRow[];
    thresholds?: ResolvedDeviceAlertThresholds;
  } = {},
) {
  const nodes = options.nodes ?? ['0000100002'];
  const builder = {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(nodes.map((name) => ({ name }))),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    // Each statement gets its own rows: fuse-opening events, active source alarms, resolved
    // source-alarm episodes or one of the three device alerts.
    query: jest.fn((sql: string) =>
      Promise.resolve(
        sql === ACTIVE_SOURCE_ALARMS_SQL
          ? (options.sourceRows ?? [])
          : sql === RESOLVED_SOURCE_ALARMS_SQL
            ? (options.resolvedRows ?? [])
            : sql === FREE_FALL_ALERTS_SQL
              ? (options.freeFallRows ?? [])
              : sql === SOLAR_PANEL_ALERTS_SQL
                ? (options.solarRows ?? [])
                : sql === OVERLOAD_ALERTS_SQL
                  ? (options.overloadRows ?? [])
                  : rows,
      ),
    ),
  };
  const faults = {
    getGroupingWindowMinutes: jest.fn().mockReturnValue(options.window ?? 5),
    getSeverityWeights: jest
      .fn()
      .mockReturnValue(options.weights ?? DEFAULT_SEVERITY_WEIGHTS),
    getDeviceAlertThresholds: jest
      .fn()
      .mockReturnValue(options.thresholds ?? DEFAULT_THRESHOLDS),
  };
  const service = new ActiveFaultsService(
    repository as unknown as Repository<Node>,
    faults as unknown as FaultsService,
  );
  return { service, repository, builder, faults };
}

describe('ActiveFaultsService (US10 · F-47, F-48, F-49)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('scope and query', () => {
    it('answers an empty list, without querying, for an empty scope', async () => {
      const { service, repository } = serviceWith([row()]);

      const result = await service.activeFaults({ kind: 'empty' }, NOW);

      expect(result).toEqual({
        generated_at: NOW.toISOString(),
        count: 0,
        counters: {
          fuseAlarmNodes: 0,
          voltageAlarmNodes: 0,
          phaseOutOfRangeNodes: 0,
          phaseDroppedNodes: 0,
        },
        faults: [],
      });
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      expect(repository.query).not.toHaveBeenCalled();
    });

    it('answers an empty list, without the history query, when no node is in scope', async () => {
      const { service, repository } = serviceWith([row()], { nodes: [] });

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.faults).toEqual([]);
      expect(repository.query).not.toHaveBeenCalled();
    });

    it('restricts the nodes to the user scope in SQL (F-10)', async () => {
      const { service, builder } = serviceWith([]);

      await service.activeFaults({ kind: 'restricted', userId: 7 }, NOW);

      expect(builder.andWhere).toHaveBeenCalledTimes(1);
      expect(builder.setParameter).toHaveBeenCalledWith('scopeUserId', 7);
    });

    it('does not restrict the nodes for the administrator', async () => {
      const { service, builder } = serviceWith([]);

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(builder.andWhere).not.toHaveBeenCalled();
    });

    it('passes the scoped nodes and the registry patterns to the history query', async () => {
      const { service, repository } = serviceWith([], {
        nodes: ['0000100001', '0000100002'],
      });

      await service.activeFaults(UNRESTRICTED, NOW);

      const documented = ALERT_TYPES.flatMap((type) => {
        const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
        return eventCodePattern === null ? [] : [eventCodePattern];
      });
      expect(repository.query).toHaveBeenCalledWith(ACTIVE_FAULT_EVENTS_SQL, [
        ['0000100001', '0000100002'],
        ALERT_TYPE_DEFINITIONS.FUSE_OPENING.eventCodePattern,
        documented,
      ]);
      expect(documented).toHaveLength(5);
    });

    it('references every parameter it receives and no other', () => {
      const placeholders = [
        ...ACTIVE_FAULT_EVENTS_SQL.matchAll(/\$(\d+)/g),
      ].map((match) => Number(match[1]));

      expect([...new Set(placeholders)].sort((a, b) => a - b)).toEqual([
        1, 2, 3,
      ]);
    });

    it('keeps long-running faults: no time lookback in the query', () => {
      expect(ACTIVE_FAULT_EVENTS_SQL).not.toMatch(
        /now\(\)|interval|current_timestamp/i,
      );
      expect(ACTIVE_FAULT_EVENTS_SQL).toContain('LIMIT 1');
    });
  });

  describe('faults', () => {
    it('returns an open two-phase fault with the documented fields', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(15) }),
        row({
          fuse_id: '0000100002-A-S',
          phase: 'S',
          recorded_at: minutesAgo(14, 48),
        }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result).toEqual({
        generated_at: '2026-10-29T15:20:00.000Z',
        count: 1,
        counters: {
          fuseAlarmNodes: 1,
          voltageAlarmNodes: 0,
          phaseOutOfRangeNodes: 0,
          phaseDroppedNodes: 0,
        },
        faults: [
          {
            id: '2:2026-10-29T15:05:00.000Z',
            node: '0000100002',
            circuit: { id: 1, name: 'CTO 1' },
            fuses_set_id: 2,
            branch: 'A',
            alert_type: 'FUSE_OPENING',
            device: 'FALCON',
            source_id: null,
            channel: null,
            state: 'OPEN',
            phases: ['R', 'S'],
            classification: 'BIPHASIC',
            client_count: 120,
            started_at: '2026-10-29T15:05:00.000Z',
            ended_at: null,
            duration_seconds: 900,
            openings: [
              {
                fuse_id: '0000100002-A-R',
                phase: 'R',
                opened_at: '2026-10-29T15:05:00.000Z',
                closed_at: null,
              },
              {
                fuse_id: '0000100002-A-S',
                phase: 'S',
                opened_at: '2026-10-29T15:05:12.000Z',
                closed_at: null,
              },
            ],
            conditions: null,
            transformer_load: null,
            warnings: [],
          },
        ],
      });
    });

    it('keeps the closes of the openings that are already closed', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(15) }),
        row({
          fuse_id: '0000100002-A-S',
          phase: 'S',
          recorded_at: minutesAgo(14, 50),
        }),
        row({ event_type: 'CLEAR', recorded_at: minutesAgo(10) }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.state).toBe('OPEN');
      expect(fault.ended_at).toBeNull();
      expect(fault.openings.map((opening) => opening.closed_at)).toEqual([
        '2026-10-29T15:10:00.000Z',
        null,
      ]);
    });

    it('lists only open faults: an earlier resolved fault of the same set is left out', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(3 * 24 * 60) }),
        row({ event_type: 'CLEAR', recorded_at: minutesAgo(3 * 24 * 60 - 40) }),
        row({ recorded_at: minutesAgo(10) }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.count).toBe(1);
      expect(result.faults[0].started_at).toBe(minutesAgo(10).toISOString());
    });

    it('does not return a set whose openings are all closed', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(30) }),
        row({ event_type: 'CLEAR', recorded_at: minutesAgo(20) }),
      ]);

      expect((await service.activeFaults(UNRESTRICTED, NOW)).faults).toEqual(
        [],
      );
    });

    it('keeps a fault open for months, with its first opening', async () => {
      const { service } = serviceWith([
        row({ recorded_at: new Date('2026-06-01T08:00:00.000Z') }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.started_at).toBe('2026-06-01T08:00:00.000Z');
      expect(fault.duration_seconds).toBe(
        Math.floor((NOW.getTime() - Date.UTC(2026, 5, 1, 8)) / 1000),
      );
    });

    it('computes the open duration up to generated_at, never below zero', async () => {
      const future = new Date(NOW.getTime() + 5000);
      const { service } = serviceWith([row({ recorded_at: future })]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.duration_seconds).toBe(0);
    });

    it('reads numbers and dates as the driver may return them (text)', async () => {
      const { service } = serviceWith([
        row({
          fuses_set_id: '2',
          client_count: '120',
          circuit_id: '1',
          recorded_at: minutesAgo(15).toISOString(),
        }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.fuses_set_id).toBe(2);
      expect(fault.client_count).toBe(120);
      expect(fault.circuit).toEqual({ id: 1, name: 'CTO 1' });
      expect(fault.started_at).toBe(minutesAgo(15).toISOString());
    });

    it('keeps an unrecorded client count and a missing branch as null', async () => {
      const { service } = serviceWith([
        row({ client_count: null, branch: null }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.client_count).toBeNull();
      expect(fault.branch).toBeNull();
    });

    it('accepts the lower-case event types the Annex writes, and ignores any other type', async () => {
      const { service } = serviceWith([
        row({ event_type: 'set', recorded_at: minutesAgo(15) }),
        row({
          fuse_id: '0000100002-A-S',
          phase: 'S',
          event_type: 'MSG',
          recorded_at: minutesAgo(14, 55),
        }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.openings.map((opening) => opening.fuse_id)).toEqual([
        '0000100002-A-R',
      ]);
    });

    it('orders faults with the same client count oldest first', async () => {
      const { service } = serviceWith([
        row({
          fuses_set_id: 3,
          branch: 'B',
          fuse_id: 'B-R',
          recorded_at: minutesAgo(5),
        }),
        row({ recorded_at: minutesAgo(40) }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.faults.map((fault) => fault.fuses_set_id)).toEqual([2, 3]);
    });
  });

  describe('order by severity (F-57)', () => {
    /** One open fault on its own fuse set, node and fuse, opened `minutes` ago. */
    const faultRow = (
      setId: number,
      clients: number | null,
      minutes: number,
    ): Row =>
      row({
        fuses_set_id: setId,
        node_id: `N${setId}`,
        fuse_id: `N${setId}-R`,
        client_count: clients,
        recorded_at: minutesAgo(minutes),
      });
    const sets = (faults: Array<{ fuses_set_id: number | null }>) =>
      faults.map((fault) => fault.fuses_set_id);

    it('lists 200, 50 and 50 affected clients as the 200 first and the two 50 oldest first', async () => {
      const { service } = serviceWith(
        [faultRow(11, 50, 5), faultRow(12, 200, 30), faultRow(13, 50, 20)],
        { nodes: ['N11', 'N12', 'N13'] },
      );

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      // Set 12 is the newest-but-one in time terms, yet first; set 13 (20 min) precedes set 11 (5 min).
      expect(sets(faults)).toEqual([12, 13, 11]);
      expect(faults.map((fault) => fault.client_count)).toEqual([200, 50, 50]);
    });

    it('does not depend on the order of the events read', async () => {
      const rows = [
        faultRow(11, 50, 5),
        faultRow(12, 200, 30),
        faultRow(13, 50, 20),
        faultRow(14, null, 90),
      ];
      const expected = [12, 13, 11, 14];

      for (const input of [rows, [...rows].reverse()]) {
        const { service } = serviceWith(input, {
          nodes: ['N11', 'N12', 'N13', 'N14'],
        });

        const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

        expect(sets(faults)).toEqual(expected);
      }
    });

    it('sorts an unknown client count as 0 but returns it as null, and a known 0 as 0', async () => {
      const { service } = serviceWith(
        [faultRow(11, 0, 10), faultRow(12, null, 20), faultRow(13, 1, 5)],
        { nodes: ['N11', 'N12', 'N13'] },
      );

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      // 1 client first; the known 0 and the unknown count tie, so the older (set 12) is first.
      expect(sets(faults)).toEqual([13, 12, 11]);
      expect(faults.map((fault) => fault.client_count)).toEqual([1, null, 0]);
    });

    it('keeps a numeric string from the database as a number when ordering', async () => {
      // PostgreSQL returns bigint/numeric columns as strings: "9" must not sort after "10" as text.
      const { service } = serviceWith(
        [
          row({
            fuses_set_id: 11,
            node_id: 'N11',
            fuse_id: 'N11-R',
            client_count: '9',
            recorded_at: minutesAgo(30),
          }),
          row({
            fuses_set_id: 12,
            node_id: 'N12',
            fuse_id: 'N12-R',
            client_count: '10',
            recorded_at: minutesAgo(5),
          }),
        ],
        { nodes: ['N11', 'N12'] },
      );

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      expect(sets(faults)).toEqual([12, 11]);
      expect(faults.map((fault) => fault.client_count)).toEqual([10, 9]);
    });

    it('takes the severity weights from FaultsService so changing them reorders the active list (NF-11 / SCRUM-238)', async () => {
      const customWeights: SeverityWeights = {
        fuseAlarm: 10,
        voltageAlarm: 200,
        droppedPhase: 300,
        phaseOutOfRange: 25,
      };
      const { service, faults: faultsService } = serviceWith(
        [row({ recorded_at: minutesAgo(15) })],
        {
          weights: customWeights,
          sourceRows: [
            sourceRow({ started_at: minutesAgo(10) }),
            smacRow({ started_at: minutesAgo(5) }),
          ],
        },
      );

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(faultsService.getSeverityWeights).toHaveBeenCalled();
      expect(result.faults.map((fault) => fault.alert_type)).toEqual([
        'PHASE_LOSS',
        'NO_VOLTAGE',
        'FUSE_OPENING',
      ]);
    });
  });

  describe('grouping rules through the service', () => {
    const spaced = (seconds: number) => [
      row({ recorded_at: minutesAgo(30) }),
      row({
        fuse_id: '0000100002-A-S',
        phase: 'S',
        recorded_at: new Date(minutesAgo(30).getTime() + seconds * 1000),
      }),
    ];

    it.each([
      ['W - 1 s groups', 299, 1],
      ['exactly W does not group', 300, 2],
      ['W + 1 s does not group', 301, 2],
    ])('with a 5 minute window, %s', async (_label, seconds, count) => {
      const { service } = serviceWith(spaced(seconds), { window: 5 });

      expect((await service.activeFaults(UNRESTRICTED, NOW)).count).toBe(count);
    });

    it('chains: each opening only has to be inside the window of the previous one', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(30) }),
        row({ fuse_id: 'x-S', phase: 'S', recorded_at: minutesAgo(26) }),
        row({ fuse_id: 'x-T', phase: 'T', recorded_at: minutesAgo(22) }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.count).toBe(1);
      expect(result.faults[0].classification).toBe('TRIPHASIC');
    });

    it('takes the window from FaultsService, so changing it changes the grouping (NF-09)', async () => {
      const wide = serviceWith(spaced(240), { window: 5 });
      const narrow = serviceWith(spaced(240), { window: 3 });

      expect((await wide.service.activeFaults(UNRESTRICTED, NOW)).count).toBe(
        1,
      );
      expect((await narrow.service.activeFaults(UNRESTRICTED, NOW)).count).toBe(
        2,
      );
      expect(wide.faults.getGroupingWindowMinutes).toHaveBeenCalled();
    });

    it('reports openings in different fuse sets of one node as separate faults, phases not summed (F-50)', async () => {
      const { service } = serviceWith([
        row({ fuses_set_id: 2, branch: 'A', recorded_at: minutesAgo(10) }),
        row({
          fuses_set_id: 3,
          branch: 'B',
          fuse_id: '0000100002-B-R',
          phase: 'R',
          recorded_at: minutesAgo(10, -5),
        }),
        row({
          fuses_set_id: 3,
          branch: 'B',
          fuse_id: '0000100002-B-S',
          phase: 'S',
          recorded_at: minutesAgo(10, -9),
        }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(
        result.faults.map((fault) => [fault.branch, fault.classification]),
      ).toEqual([
        ['A', 'MONOPHASIC'],
        ['B', 'BIPHASIC'],
      ]);
    });
  });

  describe('phases', () => {
    it('counts distinct canonical phases, not fuse identifiers', async () => {
      const { service } = serviceWith([
        row({ fuse_id: 'N-I1', phase: 'I', recorded_at: minutesAgo(15) }),
        row({ fuse_id: 'N-I2', phase: 'I', recorded_at: minutesAgo(14, 55) }),
        row({ fuse_id: 'N-C', phase: 'C', recorded_at: minutesAgo(14, 50) }),
      ]);

      const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

      expect(fault.phases).toEqual(['I', 'C']);
      expect(fault.classification).toBe('BIPHASIC');
      expect(fault.warnings).toEqual([]);
      expect(fault.openings).toHaveLength(3);
    });

    it.each([
      ['mixed alphabets', ['R', 'I']],
      ['an unsupported letter', ['R', 'X']],
      ['an empty phase', ['R', '']],
    ])(
      'does not guess for %s: no classification, a warning, raw phases kept',
      async (_label, phases) => {
        const { service } = serviceWith(
          phases.map((phase, i) =>
            row({
              fuse_id: `N-${i}`,
              phase,
              recorded_at: minutesAgo(15, -i * 10),
            }),
          ),
        );

        const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

        expect(fault.phases).toBeNull();
        expect(fault.classification).toBeNull();
        expect(fault.warnings).toEqual(['PHASES_UNCLASSIFIED']);
        expect(fault.openings.map((opening) => opening.phase)).toEqual(phases);
      },
    );
  });

  describe('event codes', () => {
    it('logs an unrecognized code once, never lists it, and does not return it', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(15) }),
        row({ event_code: '139999', recorded_at: minutesAgo(14) }),
        row({ event_code: '139999', recorded_at: minutesAgo(13) }),
      ]);

      const first = await service.activeFaults(UNRESTRICTED, NOW);
      await service.activeFaults(UNRESTRICTED, NOW);

      expect(first.count).toBe(1);
      expect(first.faults[0].openings).toHaveLength(1);
      expect(JSON.stringify(first)).not.toContain('139999');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('"139999"');
    });

    it('treats a code with surrounding whitespace as unrecognized, not as an opening', async () => {
      // The real query only returns a set that has a valid open fuse, so the valid SET comes first.
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(15) }),
        row({
          fuse_id: '0000100002-A-S',
          phase: 'S',
          event_code: '131420\n',
          recorded_at: minutesAgo(14, 50),
        }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.count).toBe(1);
      expect(
        result.faults[0].openings.map((opening) => opening.fuse_id),
      ).toEqual(['0000100002-A-R']);
      expect(result.faults[0].classification).toBe('MONOPHASIC');
      expect(JSON.stringify(result)).not.toContain('0000100002-A-S');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('Unrecognized alarm event_code');
      expect(warn.mock.calls[0][0]).toContain('131420\\n');
    });

    it('ignores, without a report, events of other supported types', async () => {
      const { service } = serviceWith([
        row({ recorded_at: minutesAgo(15) }),
        row({ event_code: '131421', recorded_at: minutesAgo(14) }),
        row({
          event_code: '131401',
          event_type: 'MSG',
          recorded_at: minutesAgo(13),
        }),
      ]);

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.faults[0].openings).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('caps the number of distinct codes it logs', async () => {
      const rows = Array.from({ length: 120 }, (_, i) =>
        row({ event_code: `UNKNOWN-${i}`, recorded_at: minutesAgo(15) }),
      );
      const { service } = serviceWith(rows);

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(warn).toHaveBeenCalledTimes(100);
    });
  });

  describe('source alarms (SCRUM-225: NO_VOLTAGE, PHASE_LOSS, PHASE_OUT_OF_RANGE)', () => {
    const typesOf = (faults: { alert_type: string }[]) =>
      faults.map((fault) => fault.alert_type);

    it('runs the five statements with the same scoped nodes, the source query with the registry patterns', async () => {
      const { service, repository } = serviceWith([], {
        nodes: ['0000100001', '0000100002'],
      });

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(repository.query).toHaveBeenCalledTimes(5);
      expect(repository.query).toHaveBeenCalledWith(ACTIVE_SOURCE_ALARMS_SQL, [
        ['0000100001', '0000100002'],
        ALERT_TYPE_DEFINITIONS.NO_VOLTAGE.eventCodePattern,
        ALERT_TYPE_DEFINITIONS.PHASE_LOSS.eventCodePattern,
        ALERT_TYPE_DEFINITIONS.PHASE_OUT_OF_RANGE.eventCodePattern,
      ]);
      expect(SOURCE_ALARM_PATTERNS).toHaveLength(3);
    });

    it('queries nothing for an empty scope or no node in scope (F-10)', async () => {
      const empty = serviceWith([], { sourceRows: [sourceRow()] });
      const none = serviceWith([], { nodes: [], sourceRows: [sourceRow()] });

      expect(
        (await empty.service.activeFaults({ kind: 'empty' }, NOW)).faults,
      ).toEqual([]);
      expect(
        (await none.service.activeFaults(UNRESTRICTED, NOW)).faults,
      ).toEqual([]);
      expect(empty.repository.query).not.toHaveBeenCalled();
      expect(none.repository.query).not.toHaveBeenCalled();
    });

    it('passes only the scoped nodes of a consultation user to the source query (F-10)', async () => {
      const { service, builder, repository } = serviceWith([], {
        nodes: ['0000100002'],
      });

      await service.activeFaults({ kind: 'restricted', userId: 7 }, NOW);

      expect(builder.setParameter).toHaveBeenCalledWith('scopeUserId', 7);
      expect(repository.query).toHaveBeenCalledWith(ACTIVE_SOURCE_ALARMS_SQL, [
        ['0000100002'],
        ...SOURCE_ALARM_PATTERNS,
      ]);
    });

    it('source SQL references $1 to $4 and no other parameter', () => {
      const placeholders = [
        ...ACTIVE_SOURCE_ALARMS_SQL.matchAll(/\$(\d+)/g),
      ].map((match) => Number(match[1]));

      expect([...new Set(placeholders)].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4,
      ]);
    });

    it('source SQL filters both kinds of source by the scoped nodes', () => {
      expect(ACTIVE_SOURCE_ALARMS_SQL).toContain(
        'fs.node_id = ANY($1::text[])',
      );
      expect(ACTIVE_SOURCE_ALARMS_SQL).toContain('t.node_id = ANY($1::text[])');
    });

    it('source SQL reads only the alarms table, by custom_id, with no time lookback', () => {
      expect(ACTIVE_SOURCE_ALARMS_SQL).not.toMatch(
        /falcon_values|smac_(vc|pw|pf)_values/,
      );
      expect(ACTIVE_SOURCE_ALARMS_SQL).not.toMatch(/hw_id/);
      expect(ACTIVE_SOURCE_ALARMS_SQL).not.toMatch(
        /now\(\)|interval|current_timestamp/i,
      );
    });

    it('source SQL normalizes the SMAC channels 1/A, 2/B, 3/C', () => {
      for (const [digit, letter] of [
        ['1', 'A'],
        ['2', 'B'],
        ['3', 'C'],
      ]) {
        expect(ACTIVE_SOURCE_ALARMS_SQL).toContain(
          `WHEN '${digit}' THEN '${letter}' WHEN '${letter}' THEN '${letter}'`,
        );
      }
    });

    it('lists a NO_VOLTAGE alarm per fuse, reading numbers as the driver may return them', async () => {
      const { service } = serviceWith([], {
        sourceRows: [
          sourceRow({
            fuses_set_id: '2',
            circuit_id: '1',
            started_at: minutesAgo(20).toISOString(),
          }),
        ],
      });

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result).toEqual({
        generated_at: NOW.toISOString(),
        count: 1,
        counters: {
          fuseAlarmNodes: 0,
          voltageAlarmNodes: 1,
          phaseOutOfRangeNodes: 0,
          phaseDroppedNodes: 0,
        },
        faults: [
          {
            id: 'NO_VOLTAGE:0000100002-A-R:2026-10-29T15:00:00.000Z',
            node: '0000100002',
            circuit: { id: 1, name: 'CTO 1' },
            fuses_set_id: 2,
            branch: 'A',
            alert_type: 'NO_VOLTAGE',
            device: 'FALCON',
            source_id: '0000100002-A-R',
            channel: null,
            state: 'OPEN',
            phases: ['R'],
            classification: null,
            client_count: null,
            started_at: '2026-10-29T15:00:00.000Z',
            ended_at: null,
            duration_seconds: 1200,
            openings: [],
            conditions: null,
            transformer_load: null,
            warnings: [],
          },
        ],
      });
    });

    it('lists the two SMAC types on the same channel as independent entries', async () => {
      const { service } = serviceWith([], {
        sourceRows: [
          smacRow({ event_code: '0514211' }),
          smacRow({ event_code: '051420A' }),
        ],
      });

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      expect(
        faults.map((fault) => [fault.alert_type, fault.channel, fault.device]),
      ).toEqual([
        ['PHASE_LOSS', 'A', 'SMAC'],
        ['PHASE_OUT_OF_RANGE', 'A', 'SMAC'],
      ]);
      expect(faults.every((fault) => fault.fuses_set_id === null)).toBe(true);
    });

    it('lists a fuse fault with clients before source alarms, which have no client count, oldest first among themselves (F-57)', async () => {
      const { service } = serviceWith([row({ recorded_at: minutesAgo(15) })], {
        sourceRows: [
          smacRow({ started_at: minutesAgo(10) }),
          sourceRow({ started_at: minutesAgo(20) }),
        ],
      });

      const result = await service.activeFaults(UNRESTRICTED, NOW);

      expect(result.count).toBe(3);
      expect(typesOf(result.faults)).toEqual([
        'FUSE_OPENING',
        'NO_VOLTAGE',
        'PHASE_LOSS',
      ]);
      expect(result.faults.map((fault) => fault.client_count)).toEqual([
        120,
        null,
        null,
      ]);
    });

    it('merges a fuse fault with an unknown client count with source alarms by age (F-57)', async () => {
      const { service } = serviceWith(
        [row({ client_count: null, recorded_at: minutesAgo(15) })],
        {
          sourceRows: [
            smacRow({ started_at: minutesAgo(10) }),
            sourceRow({ started_at: minutesAgo(20) }),
          ],
        },
      );

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      expect(typesOf(faults)).toEqual([
        'NO_VOLTAGE',
        'FUSE_OPENING',
        'PHASE_LOSS',
      ]);
    });

    it('at the same instant orders by alert type, then source, then channel', async () => {
      const at = minutesAgo(15);
      const { service } = serviceWith([row({ recorded_at: at })], {
        sourceRows: [
          smacRow({ event_code: '051420A', started_at: at }),
          smacRow({ event_code: '051421B', started_at: at }),
          smacRow({ event_code: '051421A', started_at: at }),
          sourceRow({
            source_id: '0000100002-A-S',
            phase: 'S',
            started_at: at,
          }),
          sourceRow({ started_at: at }),
        ],
      });

      const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

      expect(
        faults.map((fault) => [
          fault.alert_type,
          fault.source_id,
          fault.channel,
        ]),
      ).toEqual([
        ['FUSE_OPENING', null, null],
        ['NO_VOLTAGE', '0000100002-A-R', null],
        ['NO_VOLTAGE', '0000100002-A-S', null],
        ['PHASE_LOSS', '0000100002-T1-3', 'A'],
        ['PHASE_LOSS', '0000100002-T1-3', 'B'],
        ['PHASE_OUT_OF_RANGE', '0000100002-T1-3', 'A'],
      ]);
    });

    it('leaves fuse-opening faults exactly as they were', async () => {
      const fuseRows = [
        row({ recorded_at: minutesAgo(40) }),
        row({
          fuse_id: '0000100002-A-S',
          phase: 'S',
          recorded_at: minutesAgo(39, 50),
        }),
        row({
          fuses_set_id: 3,
          branch: 'B',
          fuse_id: '0000100002-B-R',
          recorded_at: minutesAgo(40),
        }),
      ];
      const alone = serviceWith(fuseRows);
      const mixed = serviceWith(fuseRows, {
        sourceRows: [
          sourceRow({ started_at: minutesAgo(40) }),
          smacRow({ started_at: minutesAgo(45) }),
        ],
      });

      const before = (await alone.service.activeFaults(UNRESTRICTED, NOW))
        .faults;
      const after = (
        await mixed.service.activeFaults(UNRESTRICTED, NOW)
      ).faults.filter((fault) => fault.alert_type === 'FUSE_OPENING');

      expect(after).toEqual(before);
      expect(before.map((fault) => fault.fuses_set_id)).toEqual([2, 3]);
    });

    it('does not list an alarm on an unknown SMAC channel; logs it once', async () => {
      const { service } = serviceWith([], {
        sourceRows: [smacRow({ event_code: '051421D' }), smacRow()],
      });

      const first = await service.activeFaults(UNRESTRICTED, NOW);
      await service.activeFaults(UNRESTRICTED, NOW);

      expect(first.count).toBe(1);
      expect(first.faults[0].channel).toBe('A');
      expect(JSON.stringify(first)).not.toContain('051421D');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('"051421D"');
      expect(warn.mock.calls[0][0]).toContain('UNKNOWN_CHANNEL');
    });

    it('caps the number of skipped source alarms it logs', async () => {
      const sourceRows = Array.from({ length: 120 }, (_, i) =>
        smacRow({ source_id: `T-${i}`, event_code: '051421D' }),
      );
      const { service } = serviceWith([], { sourceRows });

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(warn).toHaveBeenCalledTimes(100);
    });

    it('does not run the resolved query', async () => {
      const { service, repository } = serviceWith([]);

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(repository.query).not.toHaveBeenCalledWith(
        RESOLVED_SOURCE_ALARMS_SQL,
        expect.anything(),
      );
    });
  });

  describe('resolved source alarms (SCRUM-226 · F-60)', () => {
    const SINCE = minutesAgo(60);
    const resolvedRow = (
      row: SourceAlarmRow,
      endedAt: Date | string = minutesAgo(5),
    ): SourceAlarmEpisodeRow => ({ ...row, ended_at: endedAt });

    it('runs only the resolved query, with the scoped nodes, the registry patterns and resolvedSince', async () => {
      const { service, repository } = serviceWith([], {
        nodes: ['0000100001', '0000100002'],
      });

      await service.resolvedSourceAlarms(UNRESTRICTED, SINCE);

      expect(repository.query).toHaveBeenCalledTimes(1);
      expect(repository.query).toHaveBeenCalledWith(
        RESOLVED_SOURCE_ALARMS_SQL,
        [
          ['0000100001', '0000100002'],
          ALERT_TYPE_DEFINITIONS.NO_VOLTAGE.eventCodePattern,
          ALERT_TYPE_DEFINITIONS.PHASE_LOSS.eventCodePattern,
          ALERT_TYPE_DEFINITIONS.PHASE_OUT_OF_RANGE.eventCodePattern,
          SINCE,
        ],
      );
    });

    it('queries nothing for an empty scope or no node in scope (F-10)', async () => {
      const resolvedRows = [resolvedRow(sourceRow())];
      const empty = serviceWith([], { resolvedRows });
      const none = serviceWith([], { nodes: [], resolvedRows });

      expect(
        await empty.service.resolvedSourceAlarms({ kind: 'empty' }, SINCE),
      ).toEqual([]);
      expect(
        await none.service.resolvedSourceAlarms(UNRESTRICTED, SINCE),
      ).toEqual([]);
      expect(empty.repository.query).not.toHaveBeenCalled();
      expect(none.repository.query).not.toHaveBeenCalled();
    });

    it('restricts the nodes to a consultation user scope (F-10)', async () => {
      const { service, builder, repository } = serviceWith([], {
        nodes: ['0000100002'],
      });

      await service.resolvedSourceAlarms(
        { kind: 'restricted', userId: 7 },
        SINCE,
      );

      expect(builder.setParameter).toHaveBeenCalledWith('scopeUserId', 7);
      expect(repository.query).toHaveBeenCalledWith(
        RESOLVED_SOURCE_ALARMS_SQL,
        [['0000100002'], ...SOURCE_ALARM_PATTERNS, SINCE],
      );
    });

    it.each([
      ['an invalid Date', new Date('not a date')],
      ['a string', '2026-10-29T15:00:00.000Z'],
      ['a number', NOW.getTime()],
      ['null', null],
    ])(
      'rejects %s as resolvedSince before reading anything',
      async (_, since) => {
        const { service, repository } = serviceWith([]);

        await expect(
          service.resolvedSourceAlarms(UNRESTRICTED, since as unknown as Date),
        ).rejects.toThrow(RangeError);
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
        expect(repository.query).not.toHaveBeenCalled();
      },
    );

    it('maps each row to an episode, reading numbers and dates as the driver may return them', async () => {
      const { service } = serviceWith([], {
        resolvedRows: [
          resolvedRow(
            sourceRow({
              fuses_set_id: '2',
              circuit_id: '1',
              started_at: minutesAgo(20).toISOString(),
            }),
            minutesAgo(5).toISOString(),
          ),
          resolvedRow(smacRow({ event_code: '0514212' })),
        ],
      });

      const episodes = await service.resolvedSourceAlarms(UNRESTRICTED, SINCE);

      expect(episodes).toEqual([
        {
          id: 'NO_VOLTAGE:0000100002-A-R:2026-10-29T15:00:00.000Z',
          alertType: 'NO_VOLTAGE',
          sourceId: '0000100002-A-R',
          channel: null,
          node: '0000100002',
          circuit: { id: 1, name: 'CTO 1' },
          fuse: { fusesSetId: 2, branch: 'A', phase: 'R' },
          state: 'RESOLVED',
          startedAt: minutesAgo(20),
          endedAt: minutesAgo(5),
        },
        {
          id: 'PHASE_LOSS:0000100002-T1-3:B:2026-10-29T15:00:00.000Z',
          alertType: 'PHASE_LOSS',
          sourceId: '0000100002-T1-3',
          channel: 'B',
          node: '0000100002',
          circuit: { id: 1, name: 'CTO 1' },
          fuse: null,
          state: 'RESOLVED',
          startedAt: minutesAgo(20),
          endedAt: minutesAgo(5),
        },
      ]);
    });

    it('does not return an episode on an unknown SMAC channel; logs it once, as resolved', async () => {
      const row = smacRow({ event_code: '051421D' });
      const { service } = serviceWith([], {
        sourceRows: [row],
        resolvedRows: [resolvedRow(row), resolvedRow(smacRow())],
      });

      const first = await service.resolvedSourceAlarms(UNRESTRICTED, SINCE);
      await service.resolvedSourceAlarms(UNRESTRICTED, SINCE);
      await service.activeFaults(UNRESTRICTED, NOW);

      expect(first.map((episode) => episode.channel)).toEqual(['A']);
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
        'Resolved alarm event_code "051421D" on "0000100002-T1-3" not listed: UNKNOWN_CHANNEL',
        'Active alarm event_code "051421D" on "0000100002-T1-3" not listed: UNKNOWN_CHANNEL',
      ]);
    });
  });
});

/** An active free-fall alert on fuse 0000100002-A-R, started 40 minutes before NOW unless overridden. */
function falconAlertRow(
  overrides: Partial<FalconAlertRow> = {},
): FalconAlertRow {
  return {
    source_id: '0000100002-A-R',
    node_id: '0000100002',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    fuses_set_id: 2,
    branch: 'A',
    phase: 'R',
    started_at: minutesAgo(40),
    ...overrides,
  };
}

/** An active overload alert on transformer 0000100002-T1-3, started 30 minutes before NOW. */
function overloadRow(
  overrides: Partial<OverloadAlertRow> = {},
): OverloadAlertRow {
  return {
    source_id: '0000100002-T1-3',
    node_id: '0000100002',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    started_at: minutesAgo(30),
    load_percent: 92.5,
    vuf_percent: 1.2,
    cuf_percent: null,
    ...overrides,
  };
}

describe('ActiveFaultsService — device alerts (SCRUM-245 · F-47, US18)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('lists free fall and solar panel as fuse-level entries, with the fuse phase and no clients', async () => {
    const { service } = serviceWith([], {
      freeFallRows: [falconAlertRow()],
      solarRows: [
        falconAlertRow({
          source_id: '0000100002-A-S',
          phase: 'S2',
          started_at: '2026-10-29T15:10:00.000Z',
        }),
      ],
    });

    const { faults, count } = await service.activeFaults(UNRESTRICTED, NOW);

    expect(count).toBe(2);
    expect(faults).toEqual([
      {
        id: 'FREE_FALL:0000100002-A-R:2026-10-29T14:40:00.000Z',
        node: '0000100002',
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: 2,
        branch: 'A',
        alert_type: 'FREE_FALL',
        device: 'FALCON',
        source_id: '0000100002-A-R',
        channel: null,
        state: 'OPEN',
        phases: ['R'],
        classification: null,
        client_count: null,
        started_at: '2026-10-29T14:40:00.000Z',
        ended_at: null,
        duration_seconds: 2400,
        openings: [],
        conditions: null,
        transformer_load: null,
        warnings: [],
      },
      {
        id: 'SOLAR_PANEL_FAILURE:0000100002-A-S:2026-10-29T15:10:00.000Z',
        node: '0000100002',
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: 2,
        branch: 'A',
        alert_type: 'SOLAR_PANEL_FAILURE',
        device: 'FALCON',
        source_id: '0000100002-A-S',
        channel: null,
        state: 'OPEN',
        phases: ['S'],
        classification: null,
        client_count: null,
        started_at: '2026-10-29T15:10:00.000Z',
        ended_at: null,
        duration_seconds: 600,
        openings: [],
        conditions: null,
        transformer_load: null,
        warnings: [],
      },
    ]);
  });

  it('does not guess the phase of a fuse whose phase cannot be classified', async () => {
    const { service } = serviceWith([], {
      freeFallRows: [falconAlertRow({ phase: 'X' })],
    });

    const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

    expect(fault.phases).toBeNull();
    expect(fault.warnings).toEqual(['PHASES_UNCLASSIFIED']);
  });

  it('lists overload as one entry per transformer, with its conditions and last values', async () => {
    const { service } = serviceWith([], {
      overloadRows: [overloadRow({ load_percent: '92.5', vuf_percent: '2.5' })],
    });

    const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

    expect(faults).toEqual([
      {
        id: 'OVERLOAD_UNBALANCE:0000100002-T1-3:2026-10-29T14:50:00.000Z',
        node: '0000100002',
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: null,
        branch: null,
        alert_type: 'OVERLOAD_UNBALANCE',
        device: 'SMAC',
        source_id: '0000100002-T1-3',
        channel: null,
        state: 'OPEN',
        phases: null,
        classification: null,
        client_count: null,
        started_at: '2026-10-29T14:50:00.000Z',
        ended_at: null,
        duration_seconds: 1800,
        openings: [],
        conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE'],
        transformer_load: {
          load_percent: 92.5,
          vuf_percent: 2.5,
          cuf_percent: null,
        },
        warnings: [],
      },
    ]);
  });

  it('keeps a measurement the transformer never reported as null, not zero', async () => {
    const { service } = serviceWith([], {
      overloadRows: [
        overloadRow({
          load_percent: null,
          vuf_percent: 3,
          cuf_percent: null,
        }),
      ],
    });

    const [fault] = (await service.activeFaults(UNRESTRICTED, NOW)).faults;

    expect(fault.conditions).toEqual(['VOLTAGE_UNBALANCE']);
    expect(fault.transformer_load).toEqual({
      load_percent: null,
      vuf_percent: 3,
      cuf_percent: null,
    });
  });

  describe('NF-22 thresholds and TD-10', () => {
    const configured = (
      overloadPercent: number,
      currentUnbalancePercent: number | null = null,
    ): ResolvedDeviceAlertThresholds => ({
      thresholds: {
        overloadPercent,
        voltageUnbalancePercent: 2,
        currentUnbalancePercent,
      },
      warnings: [],
    });

    it('passes the thresholds of FaultsService to the overload query, with the current-imbalance one unset (null)', async () => {
      const { service, repository } = serviceWith([], {
        nodes: ['0000100001', '0000100002'],
      });

      await service.activeFaults(UNRESTRICTED, NOW);

      expect(repository.query).toHaveBeenCalledWith(OVERLOAD_ALERTS_SQL, [
        ['0000100001', '0000100002'],
        90,
        2,
        null,
      ]);
      expect(repository.query).toHaveBeenCalledWith(FREE_FALL_ALERTS_SQL, [
        ['0000100001', '0000100002'],
        ...FREE_FALL_ALERT_PARAMETERS,
      ]);
      expect(repository.query).toHaveBeenCalledWith(SOLAR_PANEL_ALERTS_SQL, [
        ['0000100001', '0000100002'],
      ]);
    });

    it('a lower overload threshold makes the same 85 % transformer an alert, and a higher one does not', async () => {
      const row = overloadRow({ load_percent: 85, vuf_percent: 1 });

      const at80 = serviceWith([], {
        overloadRows: [row],
        thresholds: configured(80),
      });
      const at90 = serviceWith([], { overloadRows: [row] });

      const [fault] = (await at80.service.activeFaults(UNRESTRICTED, NOW))
        .faults;
      expect(fault.conditions).toEqual(['OVERLOAD']);
      expect(at80.repository.query).toHaveBeenCalledWith(OVERLOAD_ALERTS_SQL, [
        ['0000100002'],
        80,
        2,
        null,
      ]);
      // At 90 % the query would not return the row; if it did, nothing is listed on a guess.
      expect(
        (await at90.service.activeFaults(UNRESTRICTED, NOW)).faults,
      ).toEqual([]);
    });

    it('never names the current-imbalance condition while its threshold is unset, and names it once configured', async () => {
      const row = overloadRow({
        load_percent: 95,
        vuf_percent: null,
        cuf_percent: 40,
      });

      const unset = serviceWith([], { overloadRows: [row] });
      const set = serviceWith([], {
        overloadRows: [row],
        thresholds: configured(90, 10),
      });

      expect(
        (await unset.service.activeFaults(UNRESTRICTED, NOW)).faults[0]
          .conditions,
      ).toEqual(['OVERLOAD']);
      expect(
        (await set.service.activeFaults(UNRESTRICTED, NOW)).faults[0]
          .conditions,
      ).toEqual(['OVERLOAD', 'CURRENT_UNBALANCE']);
    });

    it('does not list a transformer only its unconfigured current imbalance would flag, and logs it once', async () => {
      const { service } = serviceWith([], {
        overloadRows: [
          overloadRow({ load_percent: 50, vuf_percent: 1, cuf_percent: 40 }),
        ],
      });

      expect((await service.activeFaults(UNRESTRICTED, NOW)).faults).toEqual(
        [],
      );
      await service.activeFaults(UNRESTRICTED, NOW);

      expect(
        warn.mock.calls.filter((call) =>
          String(call[0]).startsWith('Overload alert for transformer'),
        ),
      ).toHaveLength(1);
    });

    it('logs each threshold notice once, at startup, and not again on every request', async () => {
      const notice =
        'SMAC_CURRENT_UNBALANCE_PERCENT is not set: the current-imbalance condition is disabled until the team approves a threshold (TD-10)';
      const { service } = serviceWith([], {
        thresholds: { ...DEFAULT_THRESHOLDS, warnings: [notice] },
      });

      service.onModuleInit();
      await service.activeFaults(UNRESTRICTED, NOW);
      await service.activeFaults(UNRESTRICTED, NOW);

      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([notice]);
    });
  });

  it('does not run any statement for a user without nodes', async () => {
    const { service, repository } = serviceWith([], { nodes: [] });

    expect((await service.activeFaults(UNRESTRICTED, NOW)).faults).toEqual([]);
    expect(repository.query).not.toHaveBeenCalled();
  });

  it('does not change the F-58 counters: they count only the four alert types of the original list', async () => {
    const { service } = serviceWith([], {
      freeFallRows: [falconAlertRow()],
      solarRows: [falconAlertRow({ source_id: '0000100002-A-S' })],
      overloadRows: [overloadRow()],
    });

    const { counters, count } = await service.activeFaults(UNRESTRICTED, NOW);

    expect(count).toBe(3);
    expect(counters).toEqual({
      fuseAlarmNodes: 0,
      voltageAlarmNodes: 0,
      phaseOutOfRangeNodes: 0,
      phaseDroppedNodes: 0,
    });
  });

  it('leaves fuse faults and source alarms as they were, and orders everything by F-57 (clients, then oldest)', async () => {
    const { service } = serviceWith([row()], {
      sourceRows: [
        {
          event_code: '131421',
          started_at: minutesAgo(35),
          source_id: '0000100002-A-S',
          node_id: '0000100002',
          circuit_id: 1,
          circuit_name: 'CTO 1',
          fuses_set_id: 2,
          branch: 'A',
          phase: 'S',
        },
      ],
      freeFallRows: [falconAlertRow({ started_at: minutesAgo(40) })],
      overloadRows: [overloadRow({ started_at: minutesAgo(10) })],
    });

    const { faults } = await service.activeFaults(UNRESTRICTED, NOW);

    // The fuse fault has 120 clients; the rest have none and go oldest first.
    expect(faults.map((f) => f.alert_type)).toEqual([
      'FUSE_OPENING',
      'FREE_FALL',
      'NO_VOLTAGE',
      'OVERLOAD_UNBALANCE',
    ]);
  });

  it('does not run the device-alert queries when listing resolved faults (not implemented for these types)', async () => {
    const { service, repository } = serviceWith([]);

    await service.resolvedFaults(UNRESTRICTED, '24h', NOW);

    for (const sql of [
      FREE_FALL_ALERTS_SQL,
      SOLAR_PANEL_ALERTS_SQL,
      OVERLOAD_ALERTS_SQL,
    ]) {
      expect(repository.query).not.toHaveBeenCalledWith(sql, expect.anything());
    }
  });
});
