import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { SCENARIO_ACTIONS } from './scenario-actions';
import {
  BATTERY_LEVEL_SQL,
  BATTERY_RESTORE_SQL,
  DEMO_DATABASE_SQL,
  DEVICE_CLOCK_SQL,
  FREE_FALL_ACTIVE_SQL,
  INSERT_FALCON_TELEMETRY_SQL,
  INSERT_SMAC_TELEMETRY_SQL,
  LOAD_LEVEL_SQL,
  LOAD_RESTORE_SQL,
  SOLAR_PANEL_FLAG_SQL,
  SOLAR_PANEL_RESTORE_SQL,
  SUPERCAPS_LEVEL_SQL,
  SUPERCAPS_RESTORE_SQL,
  FIRMWARE_SQL,
  FUSE_TARGET_SQL,
  INSERT_ALARM_SQL,
  INSERT_FALCON_READING_SQL,
  INSERT_SMAC_READING_SQL,
  LATEST_EVENT_SQL,
  LOCK_DEVICE_SQL,
  SYNTHETIC_MARKER_SQL,
  ScenariosService,
  TRANSFORMER_TARGET_SQL,
} from './scenarios.service';

const NOW = new Date('2026-11-15T15:00:00.000Z');
/** SCRUM-253: the database the tests designate and connect to. */
const DEMO_DB = 'colbits_demo_test';
const FUSE = {
  custom_id: '0000100002-A-R',
  hw_id: '1301000004',
  node_id: '0000100002',
  fuse_state: 'Cerrado',
  is_voltage_present: true,
};
const TRAFO = {
  custom_id: '0000100004-T1-3',
  hw_id: '0501000001',
  node_id: '0000100004',
  va: 220,
  vb: 221,
  vc: null,
  has_reading: true,
};

function serviceWith(
  options: {
    enabled?: string;
    fuse?: unknown;
    trafo?: unknown;
    latest?: string | null;
    firmware?: string | null;
    inScope?: boolean;
    /** SCRUM-253: the database clock and the device's latest record, read under the lock. */
    databaseNow?: Date;
    latestAt?: Date | null;
    /** SCRUM-253: the fuse as read again under the lock (default: the same as `fuse`). */
    fuseUnderLock?: unknown;
    /** SCRUM-253: DEMO_SCENARIOS_DATABASE (undefined = not set). */
    designated?: string;
    /** SCRUM-253: current_database(), the marker table and a marker for this database. */
    connectedTo?: string;
    markerTable?: boolean;
    marked?: boolean;
    /** SCRUM-253: the database check itself fails (e.g. a permission error). */
    guardFails?: boolean;
    /** SCRUM-253: rows returned for a given statement (the telemetry state and restore reads). */
    responses?: Record<string, unknown[]>;
    /** SCRUM-253: other settings (thresholds). */
    settings?: Record<string, string>;
  } = {},
) {
  const {
    enabled = 'true',
    latest = null,
    firmware = '14',
    inScope = true,
    databaseNow = NOW,
    latestAt = null,
    connectedTo = DEMO_DB,
    markerTable = true,
    marked = true,
    guardFails = false,
    responses = {},
    settings = {},
  } = options;
  const designated = 'designated' in options ? options.designated : DEMO_DB;
  const fuse = 'fuse' in options ? options.fuse : FUSE;
  const trafo = 'trafo' in options ? options.trafo : TRAFO;
  const fuseUnderLock =
    'fuseUnderLock' in options ? options.fuseUnderLock : fuse;
  const writes: [string, unknown[]][] = [];
  /** SCRUM-253: every statement of the transaction, in order (reads, lock and writes). */
  const steps: [string, unknown[]][] = [];
  let inTransaction = false;
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(inScope ? 1 : 0),
  };
  const query = jest.fn((sql: string) => {
    if (sql in responses) return Promise.resolve(responses[sql]);
    if (sql === FUSE_TARGET_SQL) {
      const row = inTransaction ? fuseUnderLock : fuse;
      return Promise.resolve(row ? [row] : []);
    }
    if (sql === TRANSFORMER_TARGET_SQL) {
      return Promise.resolve(trafo ? [trafo] : []);
    }
    if (sql === LATEST_EVENT_SQL) {
      return Promise.resolve(latest ? [{ event_type: latest }] : []);
    }
    if (sql === FIRMWARE_SQL) {
      return Promise.resolve(firmware ? [{ firmware }] : []);
    }
    if (sql === DEMO_DATABASE_SQL || sql === SYNTHETIC_MARKER_SQL) {
      if (guardFails) return Promise.reject(new Error('permission denied'));
      return Promise.resolve(
        sql === DEMO_DATABASE_SQL
          ? [{ database_name: connectedTo, has_marker_table: markerTable }]
          : [{ marked }],
      );
    }
    if (sql === DEVICE_CLOCK_SQL) {
      return Promise.resolve([
        { database_now: databaseNow, latest_at: latestAt },
      ]);
    }
    return Promise.resolve([]);
  });
  // SCRUM-253: the state is read under the device lock, inside the transaction. Reads and the lock
  // are answered like the reads before it; only the inserts are recorded as writes.
  const WRITES = [
    INSERT_FALCON_READING_SQL,
    INSERT_SMAC_READING_SQL,
    INSERT_ALARM_SQL,
    INSERT_FALCON_TELEMETRY_SQL,
    INSERT_SMAC_TELEMETRY_SQL,
  ];
  const manager = {
    transaction: jest.fn(
      async <T>(work: (m: { query: jest.Mock }) => Promise<T>): Promise<T> => {
        inTransaction = true;
        try {
          return await work({
            query: jest.fn((sql: string, params: unknown[]) => {
              steps.push([sql, params]);
              if (!WRITES.includes(sql)) return query(sql);
              writes.push([sql, params]);
              return Promise.resolve([]);
            }),
          });
        } finally {
          inTransaction = false;
        }
      },
    ),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query,
    manager,
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'DEMO_SCENARIOS_ENABLED'
        ? enabled
        : key === 'DEMO_SCENARIOS_DATABASE'
          ? designated
          : settings[key],
    ),
  };
  const service = new ScenariosService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, writes, query, steps, manager };
}

const ADMIN = { kind: 'unrestricted' } as const;

describe('ScenariosService (US31 · F-100, SCRUM-252)', () => {
  it('status: demo mode only when DEMO_SCENARIOS_ENABLED is "true"', async () => {
    expect((await serviceWith().service.status()).enabled).toBe(true);
    expect(
      (await serviceWith({ enabled: 'false' }).service.status()).enabled,
    ).toBe(false);
    expect((await serviceWith({ enabled: '' }).service.status()).enabled).toBe(
      false,
    );
    expect((await serviceWith().service.status()).actions[4]).toMatchObject({
      action: 'DROP_PHASE',
      target: 'TRANSFORMER',
      channel_required: true,
    });
  });

  it('refuses to write anything when demo mode is off (NF-03)', async () => {
    const { service, writes, query } = serviceWith({ enabled: 'false' });

    await expect(
      service.run({ action: 'OPEN_FUSE', target: FUSE.custom_id }, ADMIN),
    ).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('OPEN_FUSE writes an open Falcon reading and a 13xx20 SET, both stamped now', async () => {
    const { service, writes } = serviceWith();

    const result = await service.run(
      { action: 'OPEN_FUSE', target: FUSE.custom_id },
      ADMIN,
    );

    expect(result).toMatchObject({
      action: 'OPEN_FUSE',
      node: '0000100002',
      target: '0000100002-A-R',
      channel: null,
      hw_id: '1301000004',
      event_code: '131420',
      event_type: 'SET',
      recorded_at: NOW.toISOString(),
    });
    expect(writes).toEqual([
      [
        INSERT_FALCON_READING_SQL,
        [
          '1301000004',
          '0000100002-A-R',
          NOW.toISOString(),
          'Abierto',
          null,
          true,
          125,
        ],
      ],
      [
        INSERT_ALARM_SQL,
        [
          '1301000004',
          '0000100002-A-R',
          '131420',
          'SET',
          'Fusible abierto',
          '125°',
          NOW.toISOString(),
        ],
      ],
    ]);
  });

  it('CUT_VOLTAGE and RESTORE_VOLTAGE change only the voltage flag', async () => {
    const cut = serviceWith();
    await cut.service.run(
      { action: 'CUT_VOLTAGE', target: FUSE.custom_id },
      ADMIN,
    );
    expect(cut.writes[0][1].slice(3)).toEqual([null, false, null, null]);
    expect(cut.writes[1][1][2]).toBe('131421');

    const restore = serviceWith({ latest: 'SET' });
    await restore.service.run(
      { action: 'RESTORE_VOLTAGE', target: FUSE.custom_id },
      ADMIN,
    );
    expect(restore.writes[0][1].slice(3)).toEqual([null, true, null, null]);
    expect(restore.writes[1][1].slice(2, 5)).toEqual([
      '131421',
      'CLEAR',
      'Tensión normalizada',
    ]);
  });

  it('DROP_PHASE writes 0 V and no current on that channel and a 05xx21y SET', async () => {
    const { service, writes } = serviceWith({ firmware: '15' });

    const result = await service.run(
      { action: 'DROP_PHASE', target: TRAFO.custom_id, channel: 'B' },
      ADMIN,
    );

    expect(result.event_code).toBe('051521B');
    expect(writes[0]).toEqual([
      INSERT_SMAC_READING_SQL,
      ['0501000001', '0000100004-T1-3', NOW.toISOString(), 'B', 0, true],
    ]);
    expect(writes[1][1].slice(2, 6)).toEqual([
      '051521B',
      'SET',
      'Caída de la fase B',
      '0',
    ]);
  });

  it('RESTORE_PHASE writes 220 V back with a CLEAR', async () => {
    const { service, writes } = serviceWith({ latest: 'SET', firmware: null });

    await service.run(
      { action: 'RESTORE_PHASE', target: TRAFO.custom_id, channel: 'A' },
      ADMIN,
    );

    expect(writes[0][1].slice(3)).toEqual(['A', 220, false]);
    expect(writes[1][1].slice(2, 4)).toEqual(['051421A', 'CLEAR']);
  });

  it('refuses a phase the transformer does not have (CL-07)', async () => {
    const { service, writes } = serviceWith();

    await expect(
      service.run(
        { action: 'DROP_PHASE', target: TRAFO.custom_id, channel: 'C' },
        ADMIN,
      ),
    ).rejects.toThrow(/no phase on channel C/);
    expect(writes).toEqual([]);
  });

  it('without any reading, the transformer id decides which channels exist', async () => {
    const twoPhase = {
      ...TRAFO,
      custom_id: '0000100005-T1-2',
      va: null,
      vb: null,
      vc: null,
      has_reading: false,
    };
    await expect(
      serviceWith({ trafo: twoPhase }).service.run(
        { action: 'DROP_PHASE', target: twoPhase.custom_id, channel: 'C' },
        ADMIN,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      serviceWith({ trafo: twoPhase }).service.run(
        { action: 'DROP_PHASE', target: twoPhase.custom_id, channel: 'B' },
        ADMIN,
      ),
    ).resolves.toMatchObject({ event_code: '051421B' });
  });

  it('409 for an action that repeats the current state (alarms first, then telemetry)', async () => {
    await expect(
      serviceWith({ latest: 'SET' }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWith().service.run(
        { action: 'CLOSE_FUSE', target: FUSE.custom_id },
        ADMIN,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWith({ fuse: { ...FUSE, fuse_state: 'Abierto' } }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('404 for an unknown target or one outside the scope; 400 for a fuse without a Falcon', async () => {
    await expect(
      serviceWith({ fuse: null }).service.run(
        { action: 'OPEN_FUSE', target: 'X' },
        ADMIN,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      serviceWith({ inScope: false }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        { kind: 'restricted', userId: 2 },
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      serviceWith({ fuse: { ...FUSE, hw_id: null } }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
      ),
    ).rejects.toThrow(/no Falcon/);
  });

  it.each([
    [{ action: 'EXPLODE', target: 'x' }, /action must be one of/],
    [{ action: 'OPEN_FUSE', target: '  ' }, /target is required/],
    [{ action: 'DROP_PHASE', target: 'x' }, /needs channel/],
    [{ action: 'OPEN_FUSE', target: 'x', channel: 'A' }, /takes no channel/],
  ])('400 for an invalid body %p', async (body, message) => {
    const { service, query } = serviceWith();

    await expect(service.run(body as never, ADMIN)).rejects.toThrow(message);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('ScenariosService transaction (SCRUM-253)', () => {
  const OPEN = { action: 'OPEN_FUSE', target: FUSE.custom_id } as const;
  const sqlOf = (steps: [string, unknown[]][]) => steps.map(([sql]) => sql);

  it('locks the device first, then reads its state, checks it, stamps and writes', async () => {
    const { service, steps, manager } = serviceWith();

    await service.run(OPEN, ADMIN);

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(sqlOf(steps)).toEqual([
      LOCK_DEVICE_SQL,
      DEMO_DATABASE_SQL,
      SYNTHETIC_MARKER_SQL,
      FUSE_TARGET_SQL,
      LATEST_EVENT_SQL,
      FIRMWARE_SQL,
      DEVICE_CLOCK_SQL,
      INSERT_FALCON_READING_SQL,
      INSERT_ALARM_SQL,
    ]);
    expect(steps[0][1]).toEqual([FUSE.hw_id]);
    expect(steps[6][1]).toEqual([FUSE.hw_id]);
  });

  it('a repeated action is refused under the lock and writes nothing', async () => {
    const { service, steps, writes } = serviceWith({ latest: 'SET' });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(ConflictException);
    expect(sqlOf(steps)).toEqual([
      LOCK_DEVICE_SQL,
      DEMO_DATABASE_SQL,
      SYNTHETIC_MARKER_SQL,
      FUSE_TARGET_SQL,
      LATEST_EVENT_SQL,
    ]);
    expect(writes).toEqual([]);
  });

  it('decides on the state read under the lock, not on the one read before it', async () => {
    const { service, writes } = serviceWith({
      fuseUnderLock: { ...FUSE, fuse_state: 'Abierto' },
    });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(ConflictException);
    expect(writes).toEqual([]);
  });

  it('refuses when the device of the target changed between the lookup and the lock', async () => {
    const { service, writes } = serviceWith({
      fuseUnderLock: { ...FUSE, hw_id: '1301009999' },
    });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(/changed/);
    expect(writes).toEqual([]);
  });

  it('refuses (409, nothing written) when the target moved to another node, same device, after the scope check', async () => {
    const { service, writes, steps } = serviceWith({
      fuseUnderLock: { ...FUSE, node_id: '0000999999' },
    });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(ConflictException);
    await expect(
      serviceWith({
        fuseUnderLock: { ...FUSE, node_id: '0000999999' },
      }).service.run(OPEN, ADMIN),
    ).rejects.toThrow(/changed during the request/);
    expect(sqlOf(steps)).toEqual([
      LOCK_DEVICE_SQL,
      DEMO_DATABASE_SQL,
      SYNTHETIC_MARKER_SQL,
      FUSE_TARGET_SQL,
    ]);
    expect(writes).toEqual([]);
  });

  it('stamps the writes with the database clock', async () => {
    const databaseNow = new Date('2026-11-16T08:30:00.123Z');
    const { service, writes } = serviceWith({ databaseNow });

    const result = await service.run(OPEN, ADMIN);

    expect(result.recorded_at).toBe(databaseNow.toISOString());
    expect(writes.map(([, params]) => params)).toEqual([
      expect.arrayContaining([databaseNow.toISOString()]),
      expect.arrayContaining([databaseNow.toISOString()]),
    ]);
  });

  it.each([
    ['in the same millisecond', 0, 1],
    ['slightly ahead of the clock', 400, 401],
    ['999 ms ahead (the last stamp inside the tolerance)', 999, 1000],
  ])(
    'stamps 1 ms after a latest record %s',
    async (_label, aheadMs, expectedMs) => {
      const { service, writes } = serviceWith({
        latestAt: new Date(NOW.getTime() + aheadMs),
      });

      const result = await service.run(OPEN, ADMIN);

      const expected = new Date(NOW.getTime() + expectedMs).toISOString();
      expect(result.recorded_at).toBe(expected);
      expect(writes[0][1][2]).toBe(expected);
      expect(writes[1][1][6]).toBe(expected);
    },
  );

  it('refuses (409, nothing written) when the latest record is 1 s or more ahead of the clock', async () => {
    for (const aheadMs of [1000, 5000]) {
      const { service, writes } = serviceWith({
        latestAt: new Date(NOW.getTime() + aheadMs),
      });

      await expect(service.run(OPEN, ADMIN)).rejects.toThrow(
        /ahead of the database clock/,
      );
      expect(writes).toEqual([]);
    }
  });

  it('refuses an action whose kind has no handler yet, before touching the database', async () => {
    const actions = SCENARIO_ACTIONS as unknown as Record<string, unknown>;
    actions.TEST_SILENCE = {
      kind: 'silence',
      device: 'FALCON',
      channel: false,
    };
    try {
      const { service, query, manager } = serviceWith();

      await expect(
        service.run({ action: 'TEST_SILENCE', target: 'x' } as never, ADMIN),
      ).rejects.toThrow(NotImplementedException);
      expect(query).not.toHaveBeenCalled();
      expect(manager.transaction).not.toHaveBeenCalled();
    } finally {
      delete actions.TEST_SILENCE;
    }
  });
});

describe('ScenariosService demo database protection (SCRUM-253)', () => {
  const OPEN = { action: 'OPEN_FUSE', target: FUSE.custom_id } as const;
  const DROP = {
    action: 'DROP_PHASE',
    target: TRAFO.custom_id,
    channel: 'A',
  } as const;

  it('all three checks pass: status is enabled and the action writes as before', async () => {
    const { service, writes } = serviceWith();

    expect((await service.status()).enabled).toBe(true);
    await expect(service.run(OPEN, ADMIN)).resolves.toMatchObject({
      event_code: '131420',
      event_type: 'SET',
    });
    expect(writes.map(([sql]) => sql)).toEqual([
      INSERT_FALCON_READING_SQL,
      INSERT_ALARM_SQL,
    ]);
  });

  it.each([
    ['DEMO_SCENARIOS_DATABASE is not set', { designated: undefined }],
    ['DEMO_SCENARIOS_DATABASE is blank', { designated: '   ' }],
  ])(
    '%s: disabled, and 403 before any database query',
    async (_label, options) => {
      const { service, query, writes, manager } = serviceWith(options);

      expect((await service.status()).enabled).toBe(false);
      await expect(service.run(OPEN, ADMIN)).rejects.toThrow(
        /DEMO_SCENARIOS_DATABASE to name/,
      );
      expect(query).not.toHaveBeenCalled();
      expect(manager.transaction).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    },
  );

  it.each([
    ['the connected database is another one', { connectedTo: 'colbits' }],
    [
      'the designation differs only in case',
      { designated: 'COLBITS_DEMO_TEST' },
    ],
    ['the marker table does not exist', { markerTable: false }],
    [
      'there is no marker for this database (absent, or a copy naming another)',
      { marked: false },
    ],
    ['the database check fails', { guardFails: true }],
  ])(
    '%s: disabled, and 403 inside the locked transaction with nothing written',
    async (_label, options) => {
      for (const body of [OPEN, DROP]) {
        const { service, writes, steps } = serviceWith(options);

        expect((await service.status()).enabled).toBe(false);
        await expect(service.run(body, ADMIN)).rejects.toThrow(
          ForbiddenException,
        );
        expect(steps[0][0]).toBe(LOCK_DEVICE_SQL);
        expect(writes).toEqual([]);
      }
    },
  );

  it('does not read the marker of another database', async () => {
    const { service, steps } = serviceWith({ connectedTo: 'colbits' });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(/not designated/);
    expect(steps.map(([sql]) => sql)).toEqual([
      LOCK_DEVICE_SQL,
      DEMO_DATABASE_SQL,
    ]);
  });

  it('demo mode off still wins first: 403 with no database query at all', async () => {
    const { service, query } = serviceWith({ enabled: 'false' });

    expect((await service.status()).enabled).toBe(false);
    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(
      /disabled in this environment/,
    );
    expect(query).not.toHaveBeenCalled();
  });
});

describe('ScenariosService telemetry actions (SCRUM-253)', () => {
  const FUSE_ACTION = (action: string) =>
    ({ action, target: FUSE.custom_id }) as never;
  const TRAFO_ACTION = (action: string) =>
    ({ action, target: TRAFO.custom_id }) as never;
  const value = (v: unknown) => [{ value: v }];
  /** [sql, params] of each write, with the hw_id, target and stamp checked once here. */
  const written = (
    writes: [string, unknown[]][],
    target: string,
    hwId: string,
  ) =>
    writes.map(([sql, params]) => {
      expect(params.slice(0, 3)).toEqual(
        sql === INSERT_ALARM_SQL
          ? [hwId, target, expect.any(String)]
          : [hwId, target, NOW.toISOString()],
      );
      return [
        sql,
        sql === INSERT_ALARM_SQL ? params.slice(2) : params.slice(3),
      ];
    });

  describe('Falcon low energy: DRAIN_SUPERCAPS / RECHARGE_SUPERCAPS', () => {
    it('drains below FALCON_LOW_ENERGY_PERCENT (30 by default) with one reading and no event', async () => {
      const { service, writes } = serviceWith({
        responses: { [SUPERCAPS_LEVEL_SQL]: value(88) },
      });

      const result = await service.run(FUSE_ACTION('DRAIN_SUPERCAPS'), ADMIN);

      expect(written(writes, FUSE.custom_id, FUSE.hw_id)).toEqual([
        [INSERT_FALCON_TELEMETRY_SQL, [10, null, null, null]],
      ]);
      expect(result).toMatchObject({
        action: 'DRAIN_SUPERCAPS',
        node: FUSE.node_id,
        channel: null,
        event_code: null,
        event_type: null,
        recorded_at: NOW.toISOString(),
      });
    });

    it('uses the configured threshold', async () => {
      const { service, writes } = serviceWith({
        settings: { FALCON_LOW_ENERGY_PERCENT: '50' },
        responses: { [SUPERCAPS_LEVEL_SQL]: value(60) },
      });

      await service.run(FUSE_ACTION('DRAIN_SUPERCAPS'), ADMIN);

      expect(writes[0][1][3]).toBe(30);
      await expect(
        serviceWith({
          settings: { FALCON_LOW_ENERGY_PERCENT: '50' },
          responses: { [SUPERCAPS_LEVEL_SQL]: value(45) },
        }).service.run(FUSE_ACTION('DRAIN_SUPERCAPS'), ADMIN),
      ).rejects.toThrow(/already low/);
    });

    it('recharges to the level from before the drain, or to 80 without one', async () => {
      const restored = serviceWith({
        responses: {
          [SUPERCAPS_LEVEL_SQL]: value(10),
          [SUPERCAPS_RESTORE_SQL]: value(76),
        },
      });
      await restored.service.run(FUSE_ACTION('RECHARGE_SUPERCAPS'), ADMIN);
      expect(restored.writes[0][1].slice(3)).toEqual([76, null, null, null]);
      expect(
        restored.steps.find(([sql]) => sql === SUPERCAPS_RESTORE_SQL)?.[1],
      ).toEqual([FUSE.hw_id, 30]);

      const fallback = serviceWith({
        responses: { [SUPERCAPS_LEVEL_SQL]: value(10) },
      });
      await fallback.service.run(FUSE_ACTION('RECHARGE_SUPERCAPS'), ADMIN);
      expect(fallback.writes[0][1].slice(3)).toEqual([80, null, null, null]);
    });

    it('409 without writes for a drain while low and a recharge while not low', async () => {
      for (const [action, level] of [
        ['DRAIN_SUPERCAPS', 12],
        ['RECHARGE_SUPERCAPS', 30],
        ['RECHARGE_SUPERCAPS', null],
      ] as const) {
        const { service, writes } = serviceWith({
          responses: { [SUPERCAPS_LEVEL_SQL]: value(level) },
        });
        await expect(service.run(FUSE_ACTION(action), ADMIN)).rejects.toThrow(
          ConflictException,
        );
        expect(writes).toEqual([]);
      }
    });
  });

  describe('SMAC low energy: DRAIN_BATTERY / RECHARGE_BATTERY', () => {
    it('drains and recharges battery_per only, without a channel', async () => {
      const drain = serviceWith({
        settings: { SMAC_LOW_ENERGY_PERCENT: '40' },
        responses: { [BATTERY_LEVEL_SQL]: value(90) },
      });
      await drain.service.run(TRAFO_ACTION('DRAIN_BATTERY'), ADMIN);
      expect(written(drain.writes, TRAFO.custom_id, TRAFO.hw_id)).toEqual([
        [INSERT_SMAC_TELEMETRY_SQL, [20, null]],
      ]);

      const recharge = serviceWith({
        responses: {
          [BATTERY_LEVEL_SQL]: value(20),
          [BATTERY_RESTORE_SQL]: value(91),
        },
      });
      await recharge.service.run(TRAFO_ACTION('RECHARGE_BATTERY'), ADMIN);
      expect(recharge.writes[0][1].slice(3)).toEqual([91, null]);
    });

    it('409 without writes when the battery is already in that state', async () => {
      const { service, writes } = serviceWith({
        responses: { [BATTERY_LEVEL_SQL]: value(5) },
      });
      await expect(
        service.run(TRAFO_ACTION('DRAIN_BATTERY'), ADMIN),
      ).rejects.toThrow(/the SMAC battery is already low/);
      expect(writes).toEqual([]);
    });
  });

  describe('overload: START_OVERLOAD / END_OVERLOAD', () => {
    it('raises only load_percent above SMAC_OVERLOAD_PERCENT; vuf and cuf are copied by the insert', async () => {
      const { service, writes } = serviceWith({
        responses: { [LOAD_LEVEL_SQL]: value(55) },
      });

      await service.run(TRAFO_ACTION('START_OVERLOAD'), ADMIN);

      expect(written(writes, TRAFO.custom_id, TRAFO.hw_id)).toEqual([
        [INSERT_SMAC_TELEMETRY_SQL, [null, 115]],
      ]);
      expect(INSERT_SMAC_TELEMETRY_SQL).toMatch(
        /l\.cuf_percent, l\.vuf_percent, COALESCE\(\$5::numeric, l\.load_percent\)/,
      );
    });

    it('uses the configured threshold and checks the load only (an imbalance is not an overload)', async () => {
      const lower = serviceWith({
        settings: { SMAC_OVERLOAD_PERCENT: '80' },
        responses: { [LOAD_LEVEL_SQL]: value(70) },
      });
      await lower.service.run(TRAFO_ACTION('START_OVERLOAD'), ADMIN);
      expect(lower.writes[0][1].slice(3)).toEqual([null, 105]);

      // A transformer with only a voltage imbalance (its load is normal) can still be overloaded.
      const imbalanced = serviceWith({
        settings: { SMAC_VOLTAGE_UNBALANCE_PERCENT: '2' },
        responses: { [LOAD_LEVEL_SQL]: value(40) },
      });
      await expect(
        imbalanced.service.run(TRAFO_ACTION('START_OVERLOAD'), ADMIN),
      ).resolves.toMatchObject({ action: 'START_OVERLOAD' });
    });

    it('ends with the load from before the overload, or 30 points under the threshold', async () => {
      const restored = serviceWith({
        responses: {
          [LOAD_LEVEL_SQL]: value(115),
          [LOAD_RESTORE_SQL]: value(62.5),
        },
      });
      await restored.service.run(TRAFO_ACTION('END_OVERLOAD'), ADMIN);
      expect(restored.writes[0][1].slice(3)).toEqual([null, 62.5]);

      const fallback = serviceWith({
        responses: { [LOAD_LEVEL_SQL]: value(115) },
      });
      await fallback.service.run(TRAFO_ACTION('END_OVERLOAD'), ADMIN);
      expect(fallback.writes[0][1].slice(3)).toEqual([null, 60]);
    });

    it('409 without writes: start while overloaded (strictly above), end while not', async () => {
      for (const [action, load] of [
        ['START_OVERLOAD', 90.5],
        ['END_OVERLOAD', 90],
        ['END_OVERLOAD', null],
      ] as const) {
        const { service, writes } = serviceWith({
          responses: { [LOAD_LEVEL_SQL]: value(load) },
        });
        await expect(service.run(TRAFO_ACTION(action), ADMIN)).rejects.toThrow(
          /transformer load is already/,
        );
        expect(writes).toEqual([]);
      }
    });
  });

  describe('free fall: FREE_FALL / END_FREE_FALL', () => {
    it('FREE_FALL writes the flag and a 13xx01 MSG event at the same instant; the angle is kept', async () => {
      const { service, writes, steps } = serviceWith({
        firmware: '15',
        responses: { [FREE_FALL_ACTIVE_SQL]: [{ active: false }] },
      });

      const result = await service.run(FUSE_ACTION('FREE_FALL'), ADMIN);

      expect(written(writes, FUSE.custom_id, FUSE.hw_id)).toEqual([
        [INSERT_FALCON_TELEMETRY_SQL, [null, null, true, null]],
        [
          INSERT_ALARM_SQL,
          [
            '131501',
            'MSG',
            'Movimiento anormal detectado',
            null,
            NOW.toISOString(),
          ],
        ],
      ]);
      expect(result).toMatchObject({ event_code: '131501', event_type: 'MSG' });
      expect(steps.find(([sql]) => sql === FREE_FALL_ACTIVE_SQL)?.[1]).toEqual([
        FUSE.custom_id,
        FUSE.hw_id,
        '^13[0-9]{2}01$',
        '^(set|msg)$',
      ]);
      expect(INSERT_FALCON_TELEMETRY_SQL).toMatch(/l\.angle_incl/);
    });

    it('END_FREE_FALL writes a reading with the flag false and no event', async () => {
      const { service, writes } = serviceWith({
        responses: { [FREE_FALL_ACTIVE_SQL]: [{ active: true }] },
      });

      const result = await service.run(FUSE_ACTION('END_FREE_FALL'), ADMIN);

      expect(writes.map(([sql, params]) => [sql, params.slice(3)])).toEqual([
        [INSERT_FALCON_TELEMETRY_SQL, [null, null, false, null]],
      ]);
      expect(result).toMatchObject({ event_code: null, event_type: null });
    });

    it('409 without writes: a second FREE_FALL while active, an END_FREE_FALL while not', async () => {
      for (const [action, active] of [
        ['FREE_FALL', true],
        ['END_FREE_FALL', false],
      ] as const) {
        const { service, writes } = serviceWith({
          responses: { [FREE_FALL_ACTIVE_SQL]: [{ active }] },
        });
        await expect(service.run(FUSE_ACTION(action), ADMIN)).rejects.toThrow(
          /free fall is already/,
        );
        expect(writes).toEqual([]);
      }
    });
  });

  describe('solar panel: SOLAR_PANEL_ALARM / CLEAR_SOLAR_PANEL_ALARM', () => {
    it('sets the alarm with solar_panel 0, and clears it with the value from before', async () => {
      const alarm = serviceWith({
        responses: { [SOLAR_PANEL_FLAG_SQL]: value(false) },
      });
      await alarm.service.run(FUSE_ACTION('SOLAR_PANEL_ALARM'), ADMIN);
      expect(alarm.writes.map(([sql, p]) => [sql, p.slice(3)])).toEqual([
        [INSERT_FALCON_TELEMETRY_SQL, [null, 0, null, true]],
      ]);

      const clear = serviceWith({
        responses: {
          [SOLAR_PANEL_FLAG_SQL]: value(true),
          [SOLAR_PANEL_RESTORE_SQL]: value(4.5),
        },
      });
      await clear.service.run(FUSE_ACTION('CLEAR_SOLAR_PANEL_ALARM'), ADMIN);
      expect(clear.writes[0][1].slice(3)).toEqual([null, 4.5, null, false]);

      const keep = serviceWith({
        responses: { [SOLAR_PANEL_FLAG_SQL]: value(true) },
      });
      await keep.service.run(FUSE_ACTION('CLEAR_SOLAR_PANEL_ALARM'), ADMIN);
      expect(keep.writes[0][1].slice(3)).toEqual([null, null, null, false]);
    });

    it('409 without writes when the alarm is already in that state (a null flag counts as off)', async () => {
      for (const [action, flag] of [
        ['SOLAR_PANEL_ALARM', true],
        ['CLEAR_SOLAR_PANEL_ALARM', false],
        ['CLEAR_SOLAR_PANEL_ALARM', null],
      ] as const) {
        const { service, writes } = serviceWith({
          responses: { [SOLAR_PANEL_FLAG_SQL]: value(flag) },
        });
        await expect(service.run(FUSE_ACTION(action), ADMIN)).rejects.toThrow(
          /solar-panel alarm is already/,
        );
        expect(writes).toEqual([]);
      }
    });
  });

  describe('shared rules', () => {
    it('runs under the lock and the demo-database check, then reads the condition, then writes', async () => {
      const { service, steps } = serviceWith({
        responses: { [SUPERCAPS_LEVEL_SQL]: value(10) },
      });

      await service.run(FUSE_ACTION('RECHARGE_SUPERCAPS'), ADMIN);

      expect(steps.map(([sql]) => sql)).toEqual([
        LOCK_DEVICE_SQL,
        DEMO_DATABASE_SQL,
        SYNTHETIC_MARKER_SQL,
        FUSE_TARGET_SQL,
        SUPERCAPS_LEVEL_SQL,
        SUPERCAPS_RESTORE_SQL,
        DEVICE_CLOCK_SQL,
        INSERT_FALCON_TELEMETRY_SQL,
      ]);
    });

    it('403 with nothing written when the database is not designated, for every new action', async () => {
      for (const action of [
        'DRAIN_SUPERCAPS',
        'FREE_FALL',
        'SOLAR_PANEL_ALARM',
        'DRAIN_BATTERY',
        'START_OVERLOAD',
      ]) {
        const target =
          action.endsWith('BATTERY') || action.endsWith('OVERLOAD')
            ? TRAFO_ACTION(action)
            : FUSE_ACTION(action);
        const { service, writes } = serviceWith({ marked: false });
        await expect(service.run(target, ADMIN)).rejects.toThrow(
          ForbiddenException,
        );
        expect(writes).toEqual([]);
      }
    });

    it('404 outside the scope, 400 with a channel, before any lock', async () => {
      const outside = serviceWith({ inScope: false });
      await expect(
        outside.service.run(TRAFO_ACTION('START_OVERLOAD'), {
          kind: 'restricted',
          userId: 2,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(outside.steps).toEqual([]);

      const withChannel = serviceWith();
      await expect(
        withChannel.service.run(
          {
            action: 'START_OVERLOAD',
            target: TRAFO.custom_id,
            channel: 'A',
          } as never,
          ADMIN,
        ),
      ).rejects.toThrow(/takes no channel/);
      expect(withChannel.steps).toEqual([]);
    });

    it('a transformer telemetry action needs no phase: a transformer without channel C is fine', async () => {
      const { service, writes } = serviceWith({
        responses: { [BATTERY_LEVEL_SQL]: value(90) },
      });
      await service.run(TRAFO_ACTION('DRAIN_BATTERY'), ADMIN);
      expect(writes).toHaveLength(1);
    });
  });
});
