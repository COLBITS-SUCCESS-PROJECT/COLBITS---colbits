import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import {
  ACTIVE_FAULT_EVENTS_SQL,
  ActiveFaultsService,
} from './active-faults.service';
import { ALERT_TYPE_DEFINITIONS, ALERT_TYPES } from './fault-alert-types';
import { FaultsService } from './faults.service';

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

function serviceWith(
  rows: Row[],
  options: { nodes?: string[]; window?: number } = {},
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
    query: jest.fn().mockResolvedValue(rows),
  };
  const faults = {
    getGroupingWindowMinutes: jest.fn().mockReturnValue(options.window ?? 5),
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
        faults: [
          {
            id: '2:2026-10-29T15:05:00.000Z',
            node: '0000100002',
            circuit: { id: 1, name: 'CTO 1' },
            fuses_set_id: 2,
            branch: 'A',
            alert_type: 'FUSE_OPENING',
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

    it('orders the faults oldest first', async () => {
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
});
