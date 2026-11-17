import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OVERLOAD_ALERTS_SQL } from '../faults/device-alert-queries';
import { Node } from '../nodes/node.entity';
import {
  ALARMS_AFTER_CUTOFF_SQL,
  BATTERY_LEVEL_SQL,
  CLEAR_SILENCE_SQL,
  BATTERY_RESTORE_SQL,
  DEMO_DATABASE_SQL,
  DEVICE_CLOCK_SQL,
  DEVICE_LAST_RECORD_SQL,
  FALCON_BASELINE_SQL,
  FALCON_HAS_READING_SQL,
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
  RECORD_SILENCE_SQL,
  SILENCE_INTACT_SQL,
  SILENCE_STATEMENTS,
  SILENCE_TABLE_SQL,
  SMAC_BASELINE_SQL,
  SMAC_HAS_READING_SQL,
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
    /** SCRUM-253: the device's latest record by the inactivity rule (default: now, reporting). */
    lastRecordAt?: Date | null;
    /** SCRUM-253: the same after a SILENCE deleted (default: 10 h ago) and other answers then. */
    lastRecordAfterSilence?: Date | null;
    responsesAfterSilence?: Record<string, unknown[]>;
    /** SCRUM-253: whether demo_silenced_devices exists, and whether the device's silence holds. */
    silenceTable?: boolean;
    silenced?: boolean;
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
    responsesAfterSilence = {},
    silenceTable = true,
    silenced: deliberatelySilenced = false,
  } = options;
  const lastRecordAt =
    'lastRecordAt' in options ? options.lastRecordAt : databaseNow;
  const lastRecordAfterSilence =
    'lastRecordAfterSilence' in options
      ? options.lastRecordAfterSilence
      : new Date(databaseNow.getTime() - 10 * 3_600_000);
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
  const SILENCE_DELETES: string[] = Object.values(SILENCE_STATEMENTS).flatMap(
    (statements) => statements.map((statement) => statement.deleteRecent),
  );
  const silenced = () => writes.some(([sql]) => SILENCE_DELETES.includes(sql));
  const query = jest.fn((sql: string) => {
    if (silenced() && sql in responsesAfterSilence) {
      return Promise.resolve(responsesAfterSilence[sql]);
    }
    if (sql in responses) return Promise.resolve(responses[sql]);
    if (sql === SILENCE_TABLE_SQL) {
      return Promise.resolve([{ value: silenceTable }]);
    }
    if (sql === SILENCE_INTACT_SQL) {
      return Promise.resolve(deliberatelySilenced ? [{ value: true }] : []);
    }
    if (sql === DEVICE_LAST_RECORD_SQL) {
      return Promise.resolve([
        {
          database_now: databaseNow,
          last_at: silenced() ? lastRecordAfterSilence : lastRecordAt,
        },
      ]);
    }
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
    RECORD_SILENCE_SQL,
    CLEAR_SILENCE_SQL,
    ...Object.values(SILENCE_STATEMENTS).flatMap((statements) =>
      statements.flatMap((statement) => [
        statement.deleteRecent,
        statement.clearLatest,
        statement.rebuildLatest,
      ]),
    ),
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
      SILENCE_TABLE_SQL,
      SILENCE_INTACT_SQL,
      LATEST_EVENT_SQL,
      FIRMWARE_SQL,
      DEVICE_CLOCK_SQL,
      INSERT_FALCON_READING_SQL,
      INSERT_ALARM_SQL,
    ]);
    expect(steps[0][1]).toEqual([FUSE.hw_id]);
    expect(steps[8][1]).toEqual([FUSE.hw_id]);
    expect(steps[5][1]).toEqual([FUSE.hw_id, 'FALCON']);
  });

  it('a repeated action is refused under the lock and writes nothing', async () => {
    const { service, steps, writes } = serviceWith({ latest: 'SET' });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(ConflictException);
    expect(sqlOf(steps)).toEqual([
      LOCK_DEVICE_SQL,
      DEMO_DATABASE_SQL,
      SYNTHETIC_MARKER_SQL,
      FUSE_TARGET_SQL,
      SILENCE_TABLE_SQL,
      SILENCE_INTACT_SQL,
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
        SILENCE_TABLE_SQL,
        SILENCE_INTACT_SQL,
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

describe('ScenariosService inactivity: SILENCE / RESUME (SCRUM-253)', () => {
  const FALCON_CUTOFF = new Date(
    NOW.getTime() - 9 * 3_600_000 - 60_000,
  ).toISOString();
  const SMAC_CUTOFF = new Date(
    NOW.getTime() - 3 * 3_600_000 - 60_000,
  ).toISOString();
  const TEN_HOURS_AGO = new Date(NOW.getTime() - 10 * 3_600_000);
  const on = [{ value: true }];
  const off = [{ value: false }];
  const fuse = (action: string) =>
    ({ action, target: FUSE.custom_id }) as never;
  const trafo = (action: string) =>
    ({ action, target: TRAFO.custom_id }) as never;
  const FALCON_READY = {
    [FALCON_BASELINE_SQL]: on,
    [ALARMS_AFTER_CUTOFF_SQL]: [{ value: 0 }],
  };
  const SMAC_READY = {
    [SMAC_BASELINE_SQL]: on,
    [ALARMS_AFTER_CUTOFF_SQL]: [{ value: 0 }],
  };
  const deletions = (device: 'FALCON' | 'SMAC', hwId: string, cutoff: string) =>
    SILENCE_STATEMENTS[device].flatMap((statement) => [
      [statement.deleteRecent, [hwId, cutoff]],
      [statement.clearLatest, [hwId]],
      [statement.rebuildLatest, [hwId]],
    ]);
  const sqlsOf = (steps: [string, unknown[]][]) => steps.map(([sql]) => sql);
  /** One OVERLOAD_ALERTS_SQL row of the transformer (SCRUM-245's own shape). */
  const overloadRow = (
    startedAt: string,
    vuf: number,
    sourceId = TRAFO.custom_id,
  ) => ({
    source_id: sourceId,
    node_id: TRAFO.node_id,
    circuit_id: 1,
    circuit_name: 'C1',
    started_at: startedAt,
    load_percent: 50,
    vuf_percent: vuf,
    cuf_percent: 0.3,
  });

  describe('SILENCE', () => {
    it('SILENCE_FALCON: every check, then the deletion and rebuild, the checks again, and the silence record last', async () => {
      const { service, writes, steps } = serviceWith({
        responses: FALCON_READY,
      });

      const result = await service.run(fuse('SILENCE_FALCON'), ADMIN);

      expect(writes).toEqual([
        ...deletions('FALCON', FUSE.hw_id, FALCON_CUTOFF),
        [
          RECORD_SILENCE_SQL,
          [FUSE.hw_id, FUSE.custom_id, FALCON_CUTOFF, NOW.toISOString()],
        ],
      ]);
      expect(SILENCE_STATEMENTS.FALCON[0].deleteRecent).toMatch(
        /^DELETE FROM public\.falcon_values WHERE hw_id = \$1 AND recorded_at > \$2/,
      );
      expect(result).toMatchObject({
        action: 'SILENCE_FALCON',
        target: FUSE.custom_id,
        channel: null,
        event_code: null,
        event_type: null,
        recorded_at: NOW.toISOString(),
      });
      const sqls = sqlsOf(steps);
      const firstWrite = sqls.indexOf(
        SILENCE_STATEMENTS.FALCON[0].deleteRecent,
      );
      expect(sqls.slice(0, firstWrite)).toEqual([
        LOCK_DEVICE_SQL,
        DEMO_DATABASE_SQL,
        SYNTHETIC_MARKER_SQL,
        FUSE_TARGET_SQL,
        SILENCE_TABLE_SQL,
        SILENCE_INTACT_SQL,
        DEVICE_LAST_RECORD_SQL,
        FALCON_BASELINE_SQL,
        ALARMS_AFTER_CUTOFF_SQL,
        LATEST_EVENT_SQL,
        LATEST_EVENT_SQL,
        SUPERCAPS_LEVEL_SQL,
        FREE_FALL_ACTIVE_SQL,
        SOLAR_PANEL_FLAG_SQL,
      ]);
      expect(sqls.slice(firstWrite + 3, firstWrite + 5)).toEqual([
        DEVICE_LAST_RECORD_SQL,
        FUSE_TARGET_SQL,
      ]);
      expect(sqls[sqls.length - 1]).toBe(RECORD_SILENCE_SQL);
      expect(sqls).not.toContain(OVERLOAD_ALERTS_SQL);
    });

    it('SILENCE_SMAC: its three tables after now - 3 h - 1 min, its smac_vc baseline, and its overload alert read before and after', async () => {
      const { service, writes, steps } = serviceWith({ responses: SMAC_READY });

      await service.run(trafo('SILENCE_SMAC'), ADMIN);

      expect(writes).toEqual([
        ...deletions('SMAC', TRAFO.hw_id, SMAC_CUTOFF),
        [
          RECORD_SILENCE_SQL,
          [TRAFO.hw_id, TRAFO.custom_id, SMAC_CUTOFF, NOW.toISOString()],
        ],
      ]);
      expect(writes.slice(0, 9).map(([sql]) => sql.split(' ')[2])).toEqual([
        'public.smac_vc_values',
        'public.last_smac_vc_values',
        'public.last_smac_vc_values',
        'public.smac_pw_values',
        'public.last_smac_pw_values',
        'public.last_smac_pw_values',
        'public.smac_pf_values',
        'public.last_smac_pf_values',
        'public.last_smac_pf_values',
      ]);
      const sqls = sqlsOf(steps);
      const alertReads = sqls
        .map((sql, i) => (sql === OVERLOAD_ALERTS_SQL ? i : -1))
        .filter((i) => i >= 0);
      expect(alertReads).toHaveLength(2);
      expect(alertReads[0]).toBeLessThan(
        sqls.indexOf(SILENCE_STATEMENTS.SMAC[0].deleteRecent),
      );
      expect(alertReads[1]).toBeGreaterThan(
        sqls.indexOf(SILENCE_STATEMENTS.SMAC[2].rebuildLatest),
      );
      expect(alertReads[1]).toBeLessThan(sqls.indexOf(RECORD_SILENCE_SQL));
      // SCRUM-245's own query, for the transformer's node only, with its thresholds (TD-10: no cuf).
      expect(steps[alertReads[0]][1]).toEqual([[TRAFO.node_id], 90, 2, null]);
      expect(steps.find(([sql]) => sql === SMAC_BASELINE_SQL)?.[1]).toEqual([
        TRAFO.hw_id,
        SMAC_CUTOFF,
      ]);
    });

    it('uses FALCON_INACTIVITY_HOURS / SMAC_INACTIVITY_HOURS as the other services parse them', async () => {
      const custom = serviceWith({
        settings: { FALCON_INACTIVITY_HOURS: '2' },
        responses: FALCON_READY,
      });
      await custom.service.run(fuse('SILENCE_FALCON'), ADMIN);
      expect(custom.writes[0][1]).toEqual([
        FUSE.hw_id,
        new Date(NOW.getTime() - 2 * 3_600_000 - 60_000).toISOString(),
      ]);

      const invalid = serviceWith({
        settings: { SMAC_INACTIVITY_HOURS: '0' },
        responses: SMAC_READY,
      });
      await invalid.service.run(trafo('SILENCE_SMAC'), ADMIN);
      expect(invalid.writes[0][1]).toEqual([TRAFO.hw_id, SMAC_CUTOFF]);
    });

    it('409 with nothing written: already silent (stale or deliberately), no baseline, alarm events after the cutoff', async () => {
      const cases: [string, Parameters<typeof serviceWith>[0], RegExp][] = [
        [
          'SILENCE_FALCON',
          {
            responses: FALCON_READY,
            lastRecordAt: new Date(NOW.getTime() - 9 * 3_600_000 - 1),
          },
          /is already silent/,
        ],
        ['SILENCE_FALCON', { lastRecordAt: null }, /is already silent/],
        // Deliberately silenced although its readings look recent (a threshold raised meanwhile).
        [
          'SILENCE_FALCON',
          { responses: FALCON_READY, silenced: true },
          /is already silent/,
        ],
        [
          'SILENCE_FALCON',
          { responses: { ...FALCON_READY, [FALCON_BASELINE_SQL]: off } },
          /needs a reading .* from before/,
        ],
        [
          'SILENCE_SMAC',
          { responses: { ...SMAC_READY, [SMAC_BASELINE_SQL]: off } },
          /in smac_vc_values/,
        ],
        [
          'SILENCE_FALCON',
          {
            responses: {
              ...FALCON_READY,
              [ALARMS_AFTER_CUTOFF_SQL]: [{ value: 2 }],
            },
          },
          /would hide 2 alarm event/,
        ],
      ];
      for (const [action, options, message] of cases) {
        const { service, writes } = serviceWith(options);
        const body = action === 'SILENCE_SMAC' ? trafo(action) : fuse(action);
        await expect(service.run(body, ADMIN)).rejects.toThrow(message);
        expect(writes).toEqual([]);
      }
    });

    it('409 with nothing written while another scenario is active on the device', async () => {
      const cases: [unknown, Parameters<typeof serviceWith>[0], RegExp][] = [
        [
          fuse('SILENCE_FALCON'),
          {
            responses: {
              ...FALCON_READY,
              [SUPERCAPS_LEVEL_SQL]: [{ value: 10 }],
            },
          },
          /active scenario\(s\) on .*: DRAIN_SUPERCAPS; stop them first/,
        ],
        [
          fuse('SILENCE_FALCON'),
          { latest: 'SET', responses: FALCON_READY },
          /: OPEN_FUSE, CUT_VOLTAGE;/,
        ],
        [
          fuse('SILENCE_FALCON'),
          {
            responses: {
              ...FALCON_READY,
              [FREE_FALL_ACTIVE_SQL]: [{ active: true }],
            },
          },
          /: FREE_FALL;/,
        ],
        [
          fuse('SILENCE_FALCON'),
          { responses: { ...FALCON_READY, [SOLAR_PANEL_FLAG_SQL]: on } },
          /: SOLAR_PANEL_ALARM;/,
        ],
        [
          trafo('SILENCE_SMAC'),
          { responses: { ...SMAC_READY, [LOAD_LEVEL_SQL]: [{ value: 120 }] } },
          /: START_OVERLOAD;/,
        ],
        [
          trafo('SILENCE_SMAC'),
          { responses: { ...SMAC_READY, [BATTERY_LEVEL_SQL]: [{ value: 5 }] } },
          /: DRAIN_BATTERY;/,
        ],
        [
          trafo('SILENCE_SMAC'),
          // The mock answers SET to every alarm query: every channel is dropped and out of range.
          { latest: 'SET', responses: SMAC_READY },
          /: DROP_PHASE A, PHASE_OUT_OF_RANGE A, DROP_PHASE B, PHASE_OUT_OF_RANGE B, DROP_PHASE C, PHASE_OUT_OF_RANGE C;/,
        ],
      ];
      for (const [body, options, message] of cases) {
        const { service, writes } = serviceWith(options);
        await expect(service.run(body as never, ADMIN)).rejects.toThrow(
          message,
        );
        expect(writes).toEqual([]);
      }
    });

    it('without the silence table: 409 before any write, and no crash', async () => {
      for (const body of [fuse('SILENCE_FALCON'), trafo('SILENCE_SMAC')]) {
        const { service, writes, steps } = serviceWith({
          silenceTable: false,
          responses: { ...FALCON_READY, ...SMAC_READY },
        });
        await expect(service.run(body, ADMIN)).rejects.toThrow(
          /needs the demo_silenced_devices table/,
        );
        expect(writes).toEqual([]);
        expect(sqlsOf(steps)).not.toContain(SILENCE_INTACT_SQL);
      }
    });

    it('refuses after the deletion when a condition would come back (rolled back, no silence recorded)', async () => {
      const { service, manager, writes } = serviceWith({
        responses: FALCON_READY,
        responsesAfterSilence: { [SOLAR_PANEL_FLAG_SQL]: on },
      });

      await expect(service.run(fuse('SILENCE_FALCON'), ADMIN)).rejects.toThrow(
        /would bring back SOLAR_PANEL_ALARM .* nothing was changed/,
      );
      // Thrown inside the transaction callback, which rolls back the deletion and the rebuild.
      await expect(manager.transaction.mock.results[0].value).rejects.toThrow(
        /would bring back/,
      );
      expect(writes.map(([sql]) => sql)).not.toContain(RECORD_SILENCE_SQL);
    });

    it('refuses (and rolls back) when the device would still look active after the deletion', async () => {
      const { service } = serviceWith({
        responses: FALCON_READY,
        lastRecordAfterSilence: NOW,
      });

      await expect(service.run(fuse('SILENCE_FALCON'), ADMIN)).rejects.toThrow(
        /still has a record after/,
      );
    });
  });

  describe('SILENCE_SMAC keeps the SCRUM-245 OVERLOAD_UNBALANCE alert exactly as it is', () => {
    const FOUR_HOURS_AGO = new Date(
      NOW.getTime() - 4 * 3_600_000,
    ).toISOString();
    const ONE_HOUR_AGO = new Date(NOW.getTime() - 3_600_000).toISOString();
    const silenceWith = (before: unknown[], after: unknown[]) =>
      serviceWith({
        responses: { ...SMAC_READY, [OVERLOAD_ALERTS_SQL]: before },
        responsesAfterSilence: { [OVERLOAD_ALERTS_SQL]: after },
      });

    it.each([
      [
        'an imbalance only in the recent readings would disappear',
        [overloadRow(ONE_HOUR_AGO, 3)],
        [],
        /\[VOLTAGE_UNBALANCE\] -> none\)/,
      ],
      [
        'an imbalance only in the baseline would reappear',
        [],
        [overloadRow(FOUR_HOURS_AGO, 3)],
        /\(none -> .*\[VOLTAGE_UNBALANCE\]\)/,
      ],
      [
        'an episode restarted in the window would move to its older start (another id)',
        [overloadRow(ONE_HOUR_AGO, 3)],
        [overloadRow(FOUR_HOURS_AGO, 3)],
        new RegExp(`since ${ONE_HOUR_AGO}.* -> .*since ${FOUR_HOURS_AGO}`),
      ],
    ])(
      '409, rolled back, no silence recorded: %s',
      async (_label, before, after, message) => {
        const { service, writes } = silenceWith(before, after);

        await expect(service.run(trafo('SILENCE_SMAC'), ADMIN)).rejects.toThrow(
          message,
        );
        expect(writes.map(([sql]) => sql)).not.toContain(RECORD_SILENCE_SQL);
      },
    );

    it('a steady imbalance (same start, same conditions) is kept: SILENCE_SMAC goes ahead', async () => {
      const steady = [overloadRow(FOUR_HOURS_AGO, 3)];
      const { service, writes } = silenceWith(steady, steady);

      await service.run(trafo('SILENCE_SMAC'), ADMIN);

      expect(writes[writes.length - 1][0]).toBe(RECORD_SILENCE_SQL);
    });

    it('rows of the other transformers of the node, and rows without an active condition, do not count', async () => {
      const { service, writes } = silenceWith(
        [
          overloadRow(ONE_HOUR_AGO, 3, 'OTHER-T2-3'),
          overloadRow(ONE_HOUR_AGO, 1),
        ],
        [overloadRow(FOUR_HOURS_AGO, 3, 'OTHER-T2-3')],
      );

      await service.run(trafo('SILENCE_SMAC'), ADMIN);

      expect(writes[writes.length - 1][0]).toBe(RECORD_SILENCE_SQL);
    });
  });

  describe('RESUME', () => {
    it('RESUME_FALCON / RESUME_SMAC remove the silence record and write one reading copied from the latest one', async () => {
      const falcon = serviceWith({
        silenced: true,
        lastRecordAt: TEN_HOURS_AGO,
        responses: { [FALCON_HAS_READING_SQL]: on },
      });
      const resumed = await falcon.service.run(fuse('RESUME_FALCON'), ADMIN);
      expect(falcon.writes).toEqual([
        [CLEAR_SILENCE_SQL, [FUSE.hw_id]],
        [
          INSERT_FALCON_TELEMETRY_SQL,
          [
            FUSE.hw_id,
            FUSE.custom_id,
            NOW.toISOString(),
            null,
            null,
            null,
            null,
          ],
        ],
      ]);
      expect(resumed).toMatchObject({
        event_code: null,
        event_type: null,
        recorded_at: NOW.toISOString(),
      });

      const smac = serviceWith({
        silenced: true,
        lastRecordAt: TEN_HOURS_AGO,
        responses: { [SMAC_HAS_READING_SQL]: on },
      });
      await smac.service.run(trafo('RESUME_SMAC'), ADMIN);
      expect(smac.writes).toEqual([
        [CLEAR_SILENCE_SQL, [TRAFO.hw_id]],
        [
          INSERT_SMAC_TELEMETRY_SQL,
          [TRAFO.hw_id, TRAFO.custom_id, NOW.toISOString(), null, null],
        ],
      ]);
    });

    it('also resumes a merely stale device, and one silenced while its readings look recent', async () => {
      const stale = serviceWith({
        lastRecordAt: TEN_HOURS_AGO,
        responses: { [FALCON_HAS_READING_SQL]: on },
      });
      await stale.service.run(fuse('RESUME_FALCON'), ADMIN);
      expect(stale.writes.map(([sql]) => sql)).toEqual([
        CLEAR_SILENCE_SQL,
        INSERT_FALCON_TELEMETRY_SQL,
      ]);

      const silencedRecently = serviceWith({
        silenced: true,
        responses: { [FALCON_HAS_READING_SQL]: on },
      });
      await expect(
        silencedRecently.service.run(fuse('RESUME_FALCON'), ADMIN),
      ).resolves.toMatchObject({ action: 'RESUME_FALCON' });

      const noTable = serviceWith({
        silenceTable: false,
        lastRecordAt: TEN_HOURS_AGO,
        responses: { [FALCON_HAS_READING_SQL]: on },
      });
      await noTable.service.run(fuse('RESUME_FALCON'), ADMIN);
      expect(noTable.writes.map(([sql]) => sql)).toEqual([
        INSERT_FALCON_TELEMETRY_SQL,
      ]);
    });

    it('409, nothing written: a reporting device that is not silenced, or one with no reading to copy', async () => {
      const reporting = serviceWith({
        responses: { [FALCON_HAS_READING_SQL]: on },
      });
      await expect(
        reporting.service.run(fuse('RESUME_FALCON'), ADMIN),
      ).rejects.toThrow(/is already reporting/);
      expect(reporting.writes).toEqual([]);

      const empty = serviceWith({
        lastRecordAt: null,
        responses: { [SMAC_HAS_READING_SQL]: off },
      });
      await expect(
        empty.service.run(trafo('RESUME_SMAC'), ADMIN),
      ).rejects.toThrow(/no reading to report again from/);
      expect(empty.writes).toEqual([]);
    });
  });

  describe('the other actions', () => {
    it('are refused (409, nothing written) while a deliberate silence holds', async () => {
      for (const [body, silence, resume] of [
        [fuse('OPEN_FUSE'), 'SILENCE_FALCON', 'RESUME_FALCON'],
        [fuse('DRAIN_SUPERCAPS'), 'SILENCE_FALCON', 'RESUME_FALCON'],
        [fuse('FREE_FALL'), 'SILENCE_FALCON', 'RESUME_FALCON'],
        [
          { action: 'DROP_PHASE', target: TRAFO.custom_id, channel: 'A' },
          'SILENCE_SMAC',
          'RESUME_SMAC',
        ],
        [trafo('START_OVERLOAD'), 'SILENCE_SMAC', 'RESUME_SMAC'],
      ] as const) {
        const { service, writes } = serviceWith({
          silenced: true,
          lastRecordAt: TEN_HOURS_AGO,
        });
        await expect(service.run(body as never, ADMIN)).rejects.toThrow(
          new RegExp(`is silent \\(${silence}\\).* run ${resume} first`),
        );
        expect(writes).toEqual([]);
      }
    });

    it.each([
      ['OPEN_FUSE', {}],
      ['CLOSE_FUSE', { latest: 'SET' }],
      ['CUT_VOLTAGE', {}],
      ['RESTORE_VOLTAGE', { latest: 'SET' }],
      ['DROP_PHASE', {}],
      ['RESTORE_PHASE', { latest: 'SET' }],
      [
        'DRAIN_SUPERCAPS',
        { responses: { [SUPERCAPS_LEVEL_SQL]: [{ value: 85 }] } },
      ],
      [
        'RECHARGE_SUPERCAPS',
        { responses: { [SUPERCAPS_LEVEL_SQL]: [{ value: 10 }] } },
      ],
      [
        'FREE_FALL',
        { responses: { [FREE_FALL_ACTIVE_SQL]: [{ active: false }] } },
      ],
      [
        'END_FREE_FALL',
        { responses: { [FREE_FALL_ACTIVE_SQL]: [{ active: true }] } },
      ],
      ['SOLAR_PANEL_ALARM', { responses: { [SOLAR_PANEL_FLAG_SQL]: off } }],
      [
        'CLEAR_SOLAR_PANEL_ALARM',
        { responses: { [SOLAR_PANEL_FLAG_SQL]: on } },
      ],
      [
        'DRAIN_BATTERY',
        { responses: { [BATTERY_LEVEL_SQL]: [{ value: 90 }] } },
      ],
      [
        'RECHARGE_BATTERY',
        { responses: { [BATTERY_LEVEL_SQL]: [{ value: 10 }] } },
      ],
      ['START_OVERLOAD', { responses: { [LOAD_LEVEL_SQL]: [{ value: 50 }] } }],
      ['END_OVERLOAD', { responses: { [LOAD_LEVEL_SQL]: [{ value: 115 }] } }],
    ] as [string, Parameters<typeof serviceWith>[0]][])(
      '%s still writes on a merely stale device (inactive, no silence record of its own)',
      async (action, options) => {
        const { service, writes } = serviceWith({
          ...options,
          lastRecordAt: TEN_HOURS_AGO,
        });
        const smac =
          action.includes('PHASE') ||
          action.includes('BATTERY') ||
          action.includes('OVERLOAD');
        const body = {
          action,
          target: smac ? TRAFO.custom_id : FUSE.custom_id,
          ...(action.includes('PHASE') ? { channel: 'A' } : {}),
        };

        await expect(service.run(body as never, ADMIN)).resolves.toMatchObject({
          action,
        });
        expect(writes.length).toBeGreaterThan(0);
      },
    );

    it('a stale silence record (a record after its cutoff) does not hold: the actions write', async () => {
      // SILENCE_INTACT_SQL answers no row or false for it; only an intact silence refuses.
      const { service, writes } = serviceWith({ lastRecordAt: TEN_HOURS_AGO });

      await service.run(fuse('OPEN_FUSE'), ADMIN);

      expect(writes.length).toBe(2);
    });
  });

  it('403 with nothing written when the database is not designated', async () => {
    for (const body of [fuse('SILENCE_FALCON'), trafo('RESUME_SMAC')]) {
      const { service, writes } = serviceWith({
        marked: false,
        responses: { ...FALCON_READY, ...SMAC_READY },
      });
      await expect(service.run(body, ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      expect(writes).toEqual([]);
    }
  });
});
