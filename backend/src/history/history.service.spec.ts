import { NotFoundException } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';
import { FaultsService } from '../faults/faults.service';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import { HistoryQuery, HistorySelection } from './history-params';
import { SELECTION_OVERLAP_SQL } from './history-selection';
import { HistoryService } from './history.service';

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
}) {
  const { builder, recorded } = fakeQueryBuilder(options?.nodeNames ?? []);
  const nodesRepository = {
    query: jest.fn().mockResolvedValue(options?.overlapRows ?? []),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
  };
  const faultsService = { getGroupingWindowMinutes: () => 5 };
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
