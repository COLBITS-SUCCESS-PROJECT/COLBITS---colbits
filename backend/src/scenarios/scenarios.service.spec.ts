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
  DEVICE_CLOCK_SQL,
  FIRMWARE_SQL,
  FUSE_TARGET_SQL,
  INSERT_ALARM_SQL,
  INSERT_FALCON_READING_SQL,
  INSERT_SMAC_READING_SQL,
  LATEST_EVENT_SQL,
  LOCK_DEVICE_SQL,
  ScenariosService,
  TRANSFORMER_TARGET_SQL,
} from './scenarios.service';

const NOW = new Date('2026-11-15T15:00:00.000Z');
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
  } = {},
) {
  const {
    enabled = 'true',
    latest = null,
    firmware = '14',
    inScope = true,
    databaseNow = NOW,
    latestAt = null,
  } = options;
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
      key === 'DEMO_SCENARIOS_ENABLED' ? enabled : undefined,
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
  it('status: demo mode only when DEMO_SCENARIOS_ENABLED is "true"', () => {
    expect(serviceWith().service.status().enabled).toBe(true);
    expect(serviceWith({ enabled: 'false' }).service.status().enabled).toBe(
      false,
    );
    expect(serviceWith({ enabled: '' }).service.status().enabled).toBe(false);
    expect(serviceWith().service.status().actions[4]).toMatchObject({
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
      FUSE_TARGET_SQL,
      LATEST_EVENT_SQL,
      FIRMWARE_SQL,
      DEVICE_CLOCK_SQL,
      INSERT_FALCON_READING_SQL,
      INSERT_ALARM_SQL,
    ]);
    expect(steps[0][1]).toEqual([FUSE.hw_id]);
    expect(steps[4][1]).toEqual([FUSE.hw_id]);
  });

  it('a repeated action is refused under the lock and writes nothing', async () => {
    const { service, steps, writes } = serviceWith({ latest: 'SET' });

    await expect(service.run(OPEN, ADMIN)).rejects.toThrow(ConflictException);
    expect(sqlOf(steps)).toEqual([
      LOCK_DEVICE_SQL,
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
    expect(sqlOf(steps)).toEqual([LOCK_DEVICE_SQL, FUSE_TARGET_SQL]);
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
