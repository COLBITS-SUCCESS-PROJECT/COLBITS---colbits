import { NotFoundException } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';
import { FaultsService } from '../faults/faults.service';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import {
  SOURCE_ALARM_PATTERNS,
  SOURCE_ALARM_TYPES,
} from '../faults/source-alarms';
import { HistoryQuery, HistorySelection } from './history-params';
import {
  FUSE_OPENING_PATTERN,
  HISTORY_FUSE_EVENTS_SQL,
  HISTORY_NO_VOLTAGE_STARTS_SQL,
  NO_VOLTAGE_PATTERN,
  type HistoryFuseEventRow,
  type HistoryNoVoltageStartRow,
} from './history-queries';
import {
  DEVICE_SCOPED_FUSES_SQL,
  SELECTION_OVERLAP_SQL,
} from './history-selection';
import { type HistoryArea, HistoryService } from './history.service';

/** An area with no device-level restriction (what resolveArea returns without device assignments). */
const everyFuseOf = (nodes: string[]): HistoryArea => ({ nodes, fuses: null });

const NOT_FOUND = 'Selected scope element not found';
const NO_SELECTION: HistorySelection = {
  zoneIds: [],
  substationIds: [],
  circuitIds: [],
  nodes: [],
};
const RESTRICTED: ScopeContext = { kind: 'restricted', userId: 7 };
const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };
const EMPTY: ScopeContext = { kind: 'empty' };

type WhereCall = { condition: unknown; parameters?: Record<string, unknown> };

/** The query-builder methods the service calls; each one returns the builder itself. */
interface FakeQueryBuilder {
  select: jest.Mock;
  andWhere: jest.Mock;
  setParameter: jest.Mock;
  setParameters: jest.Mock;
  orderBy: jest.Mock;
  getMany: jest.Mock;
}

/** Chainable stand-in for the TypeORM query builder that records what the service asks for. */
function fakeQueryBuilder(nodeNames: string[]) {
  const recorded = {
    selected: [] as unknown[],
    andWhere: [] as WhereCall[],
    parameters: {} as Record<string, unknown>,
    orderBy: [] as unknown[][],
  };
  const builder: FakeQueryBuilder = {
    select: jest.fn((columns: unknown) => {
      recorded.selected.push(columns);
      return builder;
    }),
    andWhere: jest.fn((condition: unknown, parameters?: object) => {
      recorded.andWhere.push({
        condition,
        parameters: parameters as Record<string, unknown> | undefined,
      });
      return builder;
    }),
    setParameter: jest.fn((key: string, value: unknown) => {
      recorded.parameters[key] = value;
      return builder;
    }),
    setParameters: jest.fn((values: Record<string, unknown>) => {
      Object.assign(recorded.parameters, values);
      return builder;
    }),
    orderBy: jest.fn((...args: unknown[]) => {
      recorded.orderBy.push(args);
      return builder;
    }),
    getMany: jest.fn().mockResolvedValue(nodeNames.map((name) => ({ name }))),
  };
  return { builder, recorded };
}

/** Runs a Brackets factory against a recorder of its orWhere calls. */
function bracketsConditions(condition: unknown): WhereCall[] {
  expect(condition).toBeInstanceOf(Brackets);
  const calls: WhereCall[] = [];
  const where = {
    orWhere: (inner: unknown, parameters?: Record<string, unknown>) => {
      calls.push({ condition: inner, parameters });
      return where;
    },
  };
  (condition as Brackets).whereFactory(
    where as unknown as Parameters<Brackets['whereFactory']>[0],
  );
  return calls;
}

function serviceWith(options?: {
  nodeNames?: string[];
  overlapRows?: unknown[];
  fuseRows?: HistoryFuseEventRow[];
  noVoltageRows?: HistoryNoVoltageStartRow[];
  deviceRows?: unknown[];
  windowMinutes?: number;
}) {
  const { builder, recorded } = fakeQueryBuilder(options?.nodeNames ?? []);
  // Each read answers with its own rows, keyed by the SQL constant (as active-faults.service.spec).
  const nodesRepository = {
    query: jest.fn((sql: string, _parameters: unknown[]): Promise<unknown> => {
      if (sql === SELECTION_OVERLAP_SQL) {
        return Promise.resolve(options?.overlapRows ?? []);
      }
      if (sql === HISTORY_FUSE_EVENTS_SQL) {
        return Promise.resolve(options?.fuseRows ?? []);
      }
      if (sql === HISTORY_NO_VOLTAGE_STARTS_SQL) {
        return Promise.resolve(options?.noVoltageRows ?? []);
      }
      if (sql === DEVICE_SCOPED_FUSES_SQL) {
        return Promise.resolve(
          options?.deviceRows ?? [{ has_device_scope: false, fuses: null }],
        );
      }
      return Promise.reject(new Error('unexpected SQL'));
    }),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
  };
  const faultsService = {
    getGroupingWindowMinutes: () => options?.windowMinutes ?? 5,
  };
  const service = new HistoryService(
    nodesRepository as unknown as Repository<Node>,
    faultsService as unknown as FaultsService,
  );
  return { service, nodesRepository, builder, recorded };
}

const selectionOf = (parts: Partial<HistorySelection>): HistorySelection => ({
  ...NO_SELECTION,
  ...parts,
});

const queryOf = (selection: HistorySelection = NO_SELECTION): HistoryQuery => ({
  from: new Date('2026-10-21T05:00:00.000Z'),
  to: new Date('2026-10-24T05:00:00.000Z'),
  interval: 'day',
  selection,
});

describe('HistoryService.resolveNodes (SCRUM-283 · US20)', () => {
  it('returns no nodes and reads nothing for an empty scope without a selection', async () => {
    const { service, nodesRepository } = serviceWith();

    await expect(service.resolveNodes(EMPTY, NO_SELECTION)).resolves.toEqual(
      [],
    );
    expect(nodesRepository.query).not.toHaveBeenCalled();
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('answers 404 and reads nothing for an empty scope with any selection', async () => {
    const { service, nodesRepository } = serviceWith();

    const attempt = service.resolveNodes(
      EMPTY,
      selectionOf({ nodes: ['0000100002'] }),
    );

    await expect(attempt).rejects.toThrow(NotFoundException);
    await expect(attempt).rejects.toThrow(NOT_FOUND);
    expect(nodesRepository.query).not.toHaveBeenCalled();
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('runs only the nodes query for an unrestricted user without a selection', async () => {
    const { service, nodesRepository, builder, recorded } = serviceWith({
      nodeNames: ['a', 'b'],
    });

    await expect(
      service.resolveNodes(UNRESTRICTED, NO_SELECTION),
    ).resolves.toEqual(['a', 'b']);

    expect(nodesRepository.query).not.toHaveBeenCalled();
    expect(nodesRepository.createQueryBuilder).toHaveBeenCalledWith('node');
    expect(builder.select).toHaveBeenCalledWith(['node.name']);
    expect(recorded.andWhere).toEqual([]);
    expect(recorded.orderBy).toEqual([['node.name', 'ASC']]);
  });

  it('applies the user scope to the nodes query of a restricted user without a selection', async () => {
    const { service, nodesRepository, recorded } = serviceWith({
      nodeNames: ['a'],
    });

    await expect(
      service.resolveNodes(RESTRICTED, NO_SELECTION),
    ).resolves.toEqual(['a']);

    expect(nodesRepository.query).not.toHaveBeenCalled();
    expect(recorded.andWhere).toHaveLength(1);
    expect(String(recorded.andWhere[0].condition)).toContain(
      'public.user_scopes',
    );
    expect(recorded.parameters).toEqual({ scopeUserId: 7 });
  });

  it('checks the selection against the scope, then reads the nodes (restricted)', async () => {
    const selection = selectionOf({
      zoneIds: [1, 2],
      substationIds: [3],
      circuitIds: [4],
      nodes: ['n1'],
    });
    const { service, nodesRepository, recorded } = serviceWith({
      nodeNames: ['n1', 'n2'],
      overlapRows: [
        { type: 'zone', id: '1', overlaps_scope: true },
        { type: 'zone', id: '2', overlaps_scope: true },
        { type: 'substation', id: '3', overlaps_scope: true },
        { type: 'circuit', id: '4', overlaps_scope: true },
        { type: 'node', id: 'n1', overlaps_scope: true },
      ],
    });

    await expect(service.resolveNodes(RESTRICTED, selection)).resolves.toEqual([
      'n1',
      'n2',
    ]);

    expect(nodesRepository.query).toHaveBeenCalledTimes(1);
    expect(nodesRepository.query).toHaveBeenCalledWith(SELECTION_OVERLAP_SQL, [
      [1, 2],
      [3],
      [4],
      ['n1'],
      7,
    ]);
    expect(nodesRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    // The union of the selection first, then the user scope.
    expect(recorded.andWhere).toHaveLength(2);
    expect(bracketsConditions(recorded.andWhere[0].condition)).toEqual([
      {
        condition: 'node.circuit_id IN (:...historyCircuitIds)',
        parameters: { historyCircuitIds: [4] },
      },
      {
        condition: expect.stringContaining(
          'WHERE c.substation_id IN (:...historySubstationIds)',
        ),
        parameters: { historySubstationIds: [3] },
      },
      {
        condition: expect.stringContaining(
          'WHERE s.zone_id IN (:...historyZoneIds)',
        ),
        parameters: { historyZoneIds: [1, 2] },
      },
      {
        condition: 'node.name IN (:...historyNodes)',
        parameters: { historyNodes: ['n1'] },
      },
    ]);
    expect(String(recorded.andWhere[1].condition)).toContain(
      'public.user_scopes',
    );
    expect(recorded.parameters).toEqual({ scopeUserId: 7 });
    expect(recorded.orderBy).toEqual([['node.name', 'ASC']]);
  });

  it('only ORs the lists that were selected', async () => {
    const { service, recorded } = serviceWith({
      overlapRows: [{ type: 'zone', id: '9', overlaps_scope: true }],
    });

    await service.resolveNodes(RESTRICTED, selectionOf({ zoneIds: [9] }));

    const conditions = bracketsConditions(recorded.andWhere[0].condition);
    expect(conditions).toHaveLength(1);
    expect(conditions[0].parameters).toEqual({ historyZoneIds: [9] });
  });

  it('answers 404 when a selected element does not exist (restricted)', async () => {
    const { service, nodesRepository } = serviceWith({
      overlapRows: [{ type: 'zone', id: '1', overlaps_scope: true }],
    });

    const attempt = service.resolveNodes(
      RESTRICTED,
      selectionOf({ zoneIds: [1, 2] }),
    );

    await expect(attempt).rejects.toThrow(NotFoundException);
    await expect(attempt).rejects.toThrow(NOT_FOUND);
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('answers 404 when one selected element has no overlap with the scope', async () => {
    const { service, nodesRepository } = serviceWith({
      overlapRows: [
        { type: 'zone', id: '1', overlaps_scope: true },
        { type: 'circuit', id: '4', overlaps_scope: false },
      ],
    });

    const attempt = service.resolveNodes(
      RESTRICTED,
      selectionOf({ zoneIds: [1], circuitIds: [4] }),
    );

    await expect(attempt).rejects.toThrow(NotFoundException);
    await expect(attempt).rejects.toThrow(NOT_FOUND);
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('does not answer 404 for a parent that overlaps the scope', async () => {
    const { service } = serviceWith({
      nodeNames: ['inside'],
      overlapRows: [{ type: 'zone', id: '1', overlaps_scope: true }],
    });

    await expect(
      service.resolveNodes(RESTRICTED, selectionOf({ zoneIds: [1] })),
    ).resolves.toEqual(['inside']);
  });

  it('answers 200 with no nodes for a valid selection that holds none', async () => {
    const { service } = serviceWith({
      nodeNames: [],
      overlapRows: [{ type: 'circuit', id: '4', overlaps_scope: true }],
    });

    await expect(
      service.resolveNodes(RESTRICTED, selectionOf({ circuitIds: [4] })),
    ).resolves.toEqual([]);
  });

  it('only checks existence for an unrestricted user (user id null)', async () => {
    const selection = selectionOf({ substationIds: [3], nodes: ['n1'] });
    const { service, nodesRepository, recorded } = serviceWith({
      nodeNames: ['n1'],
      overlapRows: [
        { type: 'substation', id: '3', overlaps_scope: false },
        { type: 'node', id: 'n1', overlaps_scope: false },
      ],
    });

    await expect(
      service.resolveNodes(UNRESTRICTED, selection),
    ).resolves.toEqual(['n1']);

    expect(nodesRepository.query).toHaveBeenCalledWith(SELECTION_OVERLAP_SQL, [
      [],
      [3],
      [],
      ['n1'],
      null,
    ]);
    // Selection union only: no scope restriction for an unrestricted user.
    expect(recorded.andWhere).toHaveLength(1);
    expect(recorded.parameters).toEqual({});
  });

  it('answers 404 when an element is unknown for an unrestricted user', async () => {
    const { service, nodesRepository } = serviceWith({
      overlapRows: [{ type: 'substation', id: '3', overlaps_scope: false }],
    });

    const attempt = service.resolveNodes(
      UNRESTRICTED,
      selectionOf({ substationIds: [3], nodes: ['missing'] }),
    );

    await expect(attempt).rejects.toThrow(NotFoundException);
    await expect(attempt).rejects.toThrow(NOT_FOUND);
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('uses the same 404 body in every case', async () => {
    const bodies: unknown[] = [];
    const cases: Array<[ScopeContext, unknown[]]> = [
      [EMPTY, []],
      [RESTRICTED, []],
      [RESTRICTED, [{ type: 'zone', id: '1', overlaps_scope: false }]],
      [UNRESTRICTED, []],
    ];

    for (const [scope, overlapRows] of cases) {
      const { service } = serviceWith({ overlapRows });
      try {
        await service.resolveNodes(scope, selectionOf({ zoneIds: [1] }));
      } catch (error) {
        bodies.push((error as NotFoundException).getResponse());
      }
    }

    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      expect(body).toEqual({
        message: NOT_FOUND,
        error: 'Not Found',
        statusCode: 404,
      });
    }
  });
});

describe('HistoryService.history (SCRUM-283 · US20)', () => {
  const NOW = new Date('2026-11-20T15:20:00.000Z');

  it('returns a zero series for an empty scope without reading anything', async () => {
    const { service, nodesRepository } = serviceWith();

    const response = await service.history(EMPTY, queryOf(), NOW);

    expect(nodesRepository.query).not.toHaveBeenCalled();
    expect(nodesRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(response.totals).toEqual({ fuse_faults: 0, voltage_alarms: 0 });
    expect(response.series).toHaveLength(3);
  });

  it('maps the query and the zero-filled series to the response', async () => {
    const selection = selectionOf({
      zoneIds: [2, 1],
      substationIds: [5],
      circuitIds: [7],
      nodes: ['n2', 'n1'],
    });
    const { service } = serviceWith({
      overlapRows: [
        { type: 'zone', id: '2', overlaps_scope: true },
        { type: 'zone', id: '1', overlaps_scope: true },
        { type: 'substation', id: '5', overlaps_scope: true },
        { type: 'circuit', id: '7', overlaps_scope: true },
        { type: 'node', id: 'n2', overlaps_scope: true },
        { type: 'node', id: 'n1', overlaps_scope: true },
      ],
    });

    const response = await service.history(RESTRICTED, queryOf(selection), NOW);

    expect(response).toEqual({
      generated_at: '2026-11-20T15:20:00.000Z',
      from: '2026-10-21T05:00:00.000Z',
      to: '2026-10-24T05:00:00.000Z',
      timezone: 'America/Bogota',
      interval: 'day',
      filters: [
        { type: 'zone', id: '2' },
        { type: 'zone', id: '1' },
        { type: 'substation', id: '5' },
        { type: 'circuit', id: '7' },
        { type: 'node', id: 'n2' },
        { type: 'node', id: 'n1' },
      ],
      fuse_grouping_window_minutes: 5,
      totals: { fuse_faults: 0, voltage_alarms: 0 },
      phase_distribution: {
        single_phase: 0,
        two_phase: 0,
        three_phase: 0,
        unclassified: 0,
      },
      series: [
        {
          start: '2026-10-21T05:00:00.000Z',
          end: '2026-10-22T05:00:00.000Z',
          is_partial: false,
          fuse_faults: 0,
          voltage_alarms: 0,
        },
        {
          start: '2026-10-22T05:00:00.000Z',
          end: '2026-10-23T05:00:00.000Z',
          is_partial: false,
          fuse_faults: 0,
          voltage_alarms: 0,
        },
        {
          start: '2026-10-23T05:00:00.000Z',
          end: '2026-10-24T05:00:00.000Z',
          is_partial: false,
          fuse_faults: 0,
          voltage_alarms: 0,
        },
      ],
    });
  });

  it('uses the current time when no instant is given and an empty filter list without a selection', async () => {
    const { service } = serviceWith();
    const before = Date.now();

    const response = await service.history(UNRESTRICTED, queryOf());

    expect(Date.parse(response.generated_at)).toBeGreaterThanOrEqual(before);
    expect(response.filters).toEqual([]);
  });

  it('propagates the 404 of an invalid selection', async () => {
    const { service } = serviceWith({ overlapRows: [] });

    await expect(
      service.history(RESTRICTED, queryOf(selectionOf({ zoneIds: [1] })), NOW),
    ).rejects.toThrow(NOT_FOUND);
  });
});

describe('HistoryService.fuseFaultsStartedIn (reusable historical fault reader)', () => {
  const FROM = new Date('2026-10-21T05:00:00.000Z');
  const TO = new Date('2026-10-24T05:00:00.000Z');
  const AS_OF = new Date('2026-11-20T15:20:00.000Z');
  const at = (base: Date, minutes: number) =>
    new Date(base.getTime() + minutes * 60_000).toISOString();
  const row = (
    set: number | string,
    phase: string,
    isSet: boolean,
    recordedAt: string | Date,
  ): HistoryFuseEventRow => ({
    fuses_set_id: set,
    fuse_id: `fuse-${set}-${phase}`,
    phase,
    is_set: isSet,
    recorded_at: recordedAt,
  });

  it('returns no faults and reads nothing without nodes', async () => {
    const { service, nodesRepository } = serviceWith();

    await expect(
      service.fuseFaultsStartedIn(everyFuseOf([]), {
        from: FROM,
        to: TO,
        asOf: AS_OF,
      }),
    ).resolves.toEqual([]);
    expect(nodesRepository.query).not.toHaveBeenCalled();
  });

  it.each([
    ['from equal to to', { from: FROM, to: FROM, asOf: AS_OF }],
    ['from after to', { from: TO, to: FROM, asOf: AS_OF }],
    ['an invalid from', { from: new Date(Number.NaN), to: TO, asOf: AS_OF }],
    ['an invalid asOf', { from: FROM, to: TO, asOf: new Date(Number.NaN) }],
  ])('rejects %s with a RangeError', async (_label, range) => {
    const { service, nodesRepository } = serviceWith();

    await expect(
      service.fuseFaultsStartedIn(everyFuseOf(['n1']), range),
    ).rejects.toThrow(RangeError);
    expect(nodesRepository.query).not.toHaveBeenCalled();
  });

  it.each([
    ['the default window, asOf after to', 5, AS_OF, AS_OF],
    ['a configured window of 3 minutes', 3, AS_OF, AS_OF],
    // A `to` in the future: events up to `to` are still read (the clocks may differ).
    ['asOf before to', 5, new Date('2026-10-22T00:00:00.000Z'), TO],
  ])(
    'reads from (from - window) up to max(to, asOf) with %s',
    async (_label, windowMinutes, asOf, readUntil) => {
      const { service, nodesRepository } = serviceWith({ windowMinutes });
      const nodes = ['n1', 'n2'];

      await service.fuseFaultsStartedIn(everyFuseOf(nodes), {
        from: FROM,
        to: TO,
        asOf,
      });

      expect(nodesRepository.query).toHaveBeenCalledWith(
        HISTORY_FUSE_EVENTS_SQL,
        [
          ['n1', 'n2'],
          FUSE_OPENING_PATTERN,
          at(FROM, -windowMinutes),
          FROM.toISOString(),
          TO.toISOString(),
          readUntil.toISOString(),
          null,
        ],
      );
      // The caller's array is passed as a copy.
      const parameters = nodesRepository.query.mock.calls[0][1] as unknown[];
      expect(parameters[0]).not.toBe(nodes);
    },
  );

  it('groups with the live rule and keeps the faults that start in [from, to), complete as of asOf', async () => {
    const { service } = serviceWith({
      fuseRows: [
        // Set 1: two openings 2 minutes apart (one fault) that close only after `to`.
        row(1, 'R', true, at(FROM, 60)),
        row(1, 'S', true, at(FROM, 62)),
        row(1, 'R', false, at(TO, 60)),
        row(1, 'S', false, at(TO, 120)),
        // Set 2: open before `from` (the seed) and SET again inside: started before, left out.
        row(2, 'R', true, at(FROM, -10)),
        row(2, 'R', true, at(FROM, 300)),
        // Set 3: opens exactly at `from` (included); set 4 exactly at `to` (excluded).
        row(3, 'T', true, FROM.toISOString()),
        row(4, 'R', true, TO.toISOString()),
        // Set "5" as text and a Date instant, the way pg may return them.
        row('5', 'S', true, new Date(at(FROM, 120))),
      ],
    });

    const faults = await service.fuseFaultsStartedIn(everyFuseOf(['n1']), {
      from: FROM,
      to: TO,
      asOf: AS_OF,
    });

    expect(faults.map((fault) => fault.fusesSetId)).toEqual([3, 1, 5]);
    const [set3, set1, set5] = faults;
    expect(set3.startedAt.toISOString()).toBe(FROM.toISOString());
    expect(set3.state).toBe('OPEN');
    expect(set1.openings.map((opening) => opening.phase)).toEqual(['R', 'S']);
    expect(set1.state).toBe('RESOLVED');
    expect(set1.endedAt?.toISOString()).toBe(at(TO, 120));
    expect(set5.startedAt.toISOString()).toBe(at(FROM, 120));
  });

  it('groups with the configured window (a gap equal to the window starts a new fault)', async () => {
    const fuseRows = [
      row(1, 'R', true, at(FROM, 60)),
      row(1, 'S', true, at(FROM, 63)),
    ];
    const range = { from: FROM, to: TO, asOf: AS_OF };

    const three = serviceWith({ windowMinutes: 3, fuseRows }).service;
    const five = serviceWith({ windowMinutes: 5, fuseRows }).service;

    await expect(
      three.fuseFaultsStartedIn(everyFuseOf(['n1']), range),
    ).resolves.toHaveLength(2);
    await expect(
      five.fuseFaultsStartedIn(everyFuseOf(['n1']), range),
    ).resolves.toHaveLength(1);
  });
});

describe('HistoryService.noVoltageStartsIn (loss-of-voltage episode starts)', () => {
  const FROM = new Date('2026-10-21T05:00:00.000Z');
  const TO = new Date('2026-10-24T05:00:00.000Z');

  it('returns no starts and reads nothing without nodes', async () => {
    const { service, nodesRepository } = serviceWith();

    await expect(
      service.noVoltageStartsIn(everyFuseOf([]), FROM, TO),
    ).resolves.toEqual([]);
    expect(nodesRepository.query).not.toHaveBeenCalled();
  });

  it('reads NO_VOLTAGE with the registry pattern the live source-alarm queries use', () => {
    expect(NO_VOLTAGE_PATTERN).toBe(
      SOURCE_ALARM_PATTERNS[SOURCE_ALARM_TYPES.indexOf('NO_VOLTAGE')],
    );
  });

  it('passes the nodes, the NO_VOLTAGE pattern and the range, and maps the starts to dates', async () => {
    const { service, nodesRepository } = serviceWith({
      noVoltageRows: [
        { source_id: 'f1', started_at: '2026-10-21T10:00:00.000Z' },
        { source_id: 'f2', started_at: new Date('2026-10-22T10:00:00.000Z') },
      ],
    });

    const starts = await service.noVoltageStartsIn(
      everyFuseOf(['n1']),
      FROM,
      TO,
    );

    expect(nodesRepository.query).toHaveBeenCalledWith(
      HISTORY_NO_VOLTAGE_STARTS_SQL,
      [
        ['n1'],
        NO_VOLTAGE_PATTERN,
        FROM.toISOString(),
        TO.toISOString(),
        null,
      ],
    );
    expect(starts.map((start) => start.toISOString())).toEqual([
      '2026-10-21T10:00:00.000Z',
      '2026-10-22T10:00:00.000Z',
    ]);
  });
});

describe('HistoryService device-level authorization (F-10, F-08)', () => {
  const FROM = new Date('2026-10-21T05:00:00.000Z');
  const TO = new Date('2026-10-24T05:00:00.000Z');
  const AS_OF = new Date('2026-11-20T15:20:00.000Z');
  const NOW = AS_OF;
  const deviceArea: HistoryArea = { nodes: ['n1'], fuses: ['n1-R'] };

  describe('resolveArea', () => {
    it('does not restrict the fuses of an unrestricted user (no device query)', async () => {
      const { service, nodesRepository } = serviceWith({ nodeNames: ['n1'] });

      await expect(
        service.resolveArea(UNRESTRICTED, NO_SELECTION),
      ).resolves.toEqual({ nodes: ['n1'], fuses: null });
      expect(nodesRepository.query).not.toHaveBeenCalled();
    });

    it('reads nothing for an empty scope', async () => {
      const { service, nodesRepository } = serviceWith();

      await expect(service.resolveArea(EMPTY, NO_SELECTION)).resolves.toEqual({
        nodes: [],
        fuses: null,
      });
      expect(nodesRepository.query).not.toHaveBeenCalled();
    });

    it('skips the device query when the selection covers no nodes', async () => {
      const { service, nodesRepository } = serviceWith({ nodeNames: [] });

      await service.resolveArea(RESTRICTED, NO_SELECTION);

      expect(nodesRepository.query).not.toHaveBeenCalled();
    });

    it('keeps node-level scope exact for a user without device assignments', async () => {
      const { service, nodesRepository } = serviceWith({
        nodeNames: ['n1', 'n2'],
        deviceRows: [{ has_device_scope: false, fuses: null }],
      });

      await expect(
        service.resolveArea(RESTRICTED, NO_SELECTION),
      ).resolves.toEqual({ nodes: ['n1', 'n2'], fuses: null });
      expect(nodesRepository.query).toHaveBeenCalledWith(
        DEVICE_SCOPED_FUSES_SQL,
        [['n1', 'n2'], 7],
      );
    });

    it('limits a user with device assignments to the authorized fuses', async () => {
      const { service } = serviceWith({
        nodeNames: ['n1', 'n2'],
        deviceRows: [{ has_device_scope: true, fuses: ['n1-R', 'n2-R'] }],
      });

      await expect(
        service.resolveArea(RESTRICTED, NO_SELECTION),
      ).resolves.toEqual({ nodes: ['n1', 'n2'], fuses: ['n1-R', 'n2-R'] });
    });

    it('fails closed: device assignments with no fuse list authorize no fuse', async () => {
      const { service } = serviceWith({
        nodeNames: ['n1'],
        deviceRows: [{ has_device_scope: true, fuses: null }],
      });

      await expect(
        service.resolveArea(RESTRICTED, NO_SELECTION),
      ).resolves.toEqual({ nodes: ['n1'], fuses: [] });
    });

    it('fails when the device query returns no row', async () => {
      const { service } = serviceWith({ nodeNames: ['n1'], deviceRows: [] });

      await expect(
        service.resolveArea(RESTRICTED, NO_SELECTION),
      ).rejects.toThrow('The device-scope query returned no row');
    });
  });

  it('passes the authorized fuses to both historical reads', async () => {
    const { service, nodesRepository } = serviceWith();

    await service.fuseFaultsStartedIn(deviceArea, {
      from: FROM,
      to: TO,
      asOf: AS_OF,
    });
    await service.noVoltageStartsIn(deviceArea, FROM, TO);

    const parameters = nodesRepository.query.mock.calls.map(([sql, values]) => [
      sql,
      values[values.length - 1],
    ]);
    expect(parameters).toEqual([
      [HISTORY_FUSE_EVENTS_SQL, ['n1-R']],
      [HISTORY_NO_VOLTAGE_STARTS_SQL, ['n1-R']],
    ]);
  });

  it('reads nothing when no fuse is authorized (fail closed)', async () => {
    const { service, nodesRepository } = serviceWith();
    const none: HistoryArea = { nodes: ['n1'], fuses: [] };

    await expect(
      service.fuseFaultsStartedIn(none, { from: FROM, to: TO, asOf: AS_OF }),
    ).resolves.toEqual([]);
    await expect(service.noVoltageStartsIn(none, FROM, TO)).resolves.toEqual(
      [],
    );
    expect(nodesRepository.query).not.toHaveBeenCalled();
  });

  it('applies the device restriction to GET /history counts', async () => {
    const { service, nodesRepository } = serviceWith({
      nodeNames: ['n1'],
      deviceRows: [{ has_device_scope: true, fuses: ['n1-R'] }],
    });

    await service.history(RESTRICTED, queryOf(), NOW);

    const reads = nodesRepository.query.mock.calls.filter(
      ([sql]) =>
        sql === HISTORY_FUSE_EVENTS_SQL ||
        sql === HISTORY_NO_VOLTAGE_STARTS_SQL,
    );
    expect(reads).toHaveLength(2);
    for (const [, values] of reads) {
      expect(values[values.length - 1]).toEqual(['n1-R']);
    }
  });

  it('answers zeros without reading events when a device user has no authorized fuse', async () => {
    const { service, nodesRepository } = serviceWith({
      nodeNames: ['n1'],
      deviceRows: [{ has_device_scope: true, fuses: [] }],
    });

    const response = await service.history(RESTRICTED, queryOf(), NOW);

    expect(response.totals).toEqual({ fuse_faults: 0, voltage_alarms: 0 });
    expect(nodesRepository.query.mock.calls.map(([sql]) => sql)).toEqual([
      DEVICE_SCOPED_FUSES_SQL,
    ]);
  });
});

describe('HistoryService.history with historical events (F-66, F-67)', () => {
  const NOW = new Date('2026-11-20T15:20:00.000Z');
  const fuse = (
    set: number,
    fuseId: string,
    phase: string,
    recordedAt: string,
  ): HistoryFuseEventRow => ({
    fuses_set_id: set,
    fuse_id: fuseId,
    phase,
    is_set: true,
    recorded_at: recordedAt,
  });

  it('counts fuse faults and loss-of-voltage alarms in the bucket of their start', async () => {
    const { service, nodesRepository } = serviceWith({
      nodeNames: ['n1', 'n2'],
      fuseRows: [
        // Day 1: one fault of two openings (counted once) and one starting 1 ms before day 2.
        fuse(1, 'a-R', 'R', '2026-10-21T10:00:00.000Z'),
        fuse(1, 'a-S', 'S', '2026-10-21T10:01:00.000Z'),
        fuse(2, 'b-R', 'R', '2026-10-22T04:59:59.999Z'),
        // Day 3: one fault starting 1 ms before the end of the range.
        fuse(3, 'c-R', 'R', '2026-10-24T04:59:59.999Z'),
      ],
      noVoltageRows: [
        { source_id: 'a-R', started_at: '2026-10-22T05:00:00.000Z' },
        { source_id: 'b-T', started_at: '2026-10-22T06:00:00.000Z' },
      ],
    });

    const response = await service.history(UNRESTRICTED, queryOf(), NOW);

    expect(
      response.series.map((bucket) => [
        bucket.start,
        bucket.fuse_faults,
        bucket.voltage_alarms,
      ]),
    ).toEqual([
      ['2026-10-21T05:00:00.000Z', 2, 0],
      ['2026-10-22T05:00:00.000Z', 0, 2],
      ['2026-10-23T05:00:00.000Z', 1, 0],
    ]);
    expect(response.totals).toEqual({ fuse_faults: 3, voltage_alarms: 2 });

    const fuseCall = nodesRepository.query.mock.calls.find(
      ([sql]) => sql === HISTORY_FUSE_EVENTS_SQL,
    );
    const fuseParameters = fuseCall?.[1] as unknown[];
    expect(fuseParameters[0]).toEqual(['n1', 'n2']);
    // The faults are complete as of the request time.
    expect(fuseParameters[5]).toBe(NOW.toISOString());
  });

  it('reads no events when the selection covers no nodes', async () => {
    const { service, nodesRepository } = serviceWith({
      nodeNames: [],
      overlapRows: [{ type: 'circuit', id: '9', overlaps_scope: true }],
    });

    const response = await service.history(
      RESTRICTED,
      queryOf(selectionOf({ circuitIds: [9] })),
      NOW,
    );

    expect(response.totals).toEqual({ fuse_faults: 0, voltage_alarms: 0 });
    expect(nodesRepository.query).toHaveBeenCalledTimes(1);
    expect(nodesRepository.query).toHaveBeenCalledWith(
      SELECTION_OVERLAP_SQL,
      expect.any(Array),
    );
  });

  it('counts R, S and T openings of the same fuse set within 3 minutes as exactly one three-phase fault (SCRUM-284 · F-67)', async () => {
    const { service } = serviceWith({
      nodeNames: ['n1'],
      fuseRows: [
        fuse(1, 'a-R', 'R', '2026-10-21T10:00:00.000Z'),
        fuse(1, 'a-S', 'S', '2026-10-21T10:01:30.000Z'),
        fuse(1, 'a-T', 'T', '2026-10-21T10:02:59.000Z'),
      ],
    });

    const response = await service.history(UNRESTRICTED, queryOf(), NOW);

    expect(response.totals.fuse_faults).toBe(1);
    expect(response.phase_distribution).toEqual({
      single_phase: 0,
      two_phase: 0,
      three_phase: 1,
      unclassified: 0,
    });
  });

  it('distributes single-, two-, three-phase and unclassified faults across the range (SCRUM-284 · F-67)', async () => {
    const { service } = serviceWith({
      nodeNames: ['n1'],
      fuseRows: [
        // Fuse set 1: single-phase (R)
        fuse(1, 'a-R', 'R', '2026-10-21T10:00:00.000Z'),
        // Fuse set 2: two-phase (R + S within window)
        fuse(2, 'b-R', 'R', '2026-10-21T11:00:00.000Z'),
        fuse(2, 'b-S', 'S', '2026-10-21T11:02:00.000Z'),
        // Fuse set 3: three-phase (R + S + T within 3 minutes)
        fuse(3, 'c-R', 'R', '2026-10-22T08:00:00.000Z'),
        fuse(3, 'c-S', 'S', '2026-10-22T08:01:00.000Z'),
        fuse(3, 'c-T', 'T', '2026-10-22T08:02:30.000Z'),
        // Fuse set 4: unclassified (unsupported phase letter)
        fuse(4, 'd-X', 'X', '2026-10-23T09:00:00.000Z'),
      ],
    });

    const response = await service.history(UNRESTRICTED, queryOf(), NOW);

    expect(response.totals.fuse_faults).toBe(4);
    expect(response.phase_distribution).toEqual({
      single_phase: 1,
      two_phase: 1,
      three_phase: 1,
      unclassified: 1,
    });
  });
});