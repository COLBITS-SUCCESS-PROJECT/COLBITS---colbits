import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import {
  FIRMWARE_SQL,
  FUSE_TARGET_SQL,
  INSERT_ALARM_SQL,
  INSERT_FALCON_READING_SQL,
  INSERT_SMAC_READING_SQL,
  LATEST_EVENT_SQL,
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
  } = {},
) {
  const {
    enabled = 'true',
    latest = null,
    firmware = '14',
    inScope = true,
  } = options;
  const fuse = 'fuse' in options ? options.fuse : FUSE;
  const trafo = 'trafo' in options ? options.trafo : TRAFO;
  const writes: [string, unknown[]][] = [];
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(inScope ? 1 : 0),
  };
  const query = jest.fn((sql: string) => {
    if (sql === FUSE_TARGET_SQL) return Promise.resolve(fuse ? [fuse] : []);
    if (sql === TRANSFORMER_TARGET_SQL) {
      return Promise.resolve(trafo ? [trafo] : []);
    }
    if (sql === LATEST_EVENT_SQL) {
      return Promise.resolve(latest ? [{ event_type: latest }] : []);
    }
    if (sql === FIRMWARE_SQL) {
      return Promise.resolve(firmware ? [{ firmware }] : []);
    }
    return Promise.resolve([]);
  });
  const manager = {
    transaction: jest.fn(
      async (work: (m: { query: jest.Mock }) => Promise<void>) => {
        await work({
          query: jest.fn((sql: string, params: unknown[]) => {
            writes.push([sql, params]);
            return Promise.resolve([]);
          }),
        });
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
  return { service, writes, query };
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
      service.run({ action: 'OPEN_FUSE', target: FUSE.custom_id }, ADMIN, NOW),
    ).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('OPEN_FUSE writes an open Falcon reading and a 13xx20 SET, both stamped now', async () => {
    const { service, writes } = serviceWith();

    const result = await service.run(
      { action: 'OPEN_FUSE', target: FUSE.custom_id },
      ADMIN,
      NOW,
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
      NOW,
    );
    expect(cut.writes[0][1].slice(3)).toEqual([null, false, null, null]);
    expect(cut.writes[1][1][2]).toBe('131421');

    const restore = serviceWith({ latest: 'SET' });
    await restore.service.run(
      { action: 'RESTORE_VOLTAGE', target: FUSE.custom_id },
      ADMIN,
      NOW,
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
      NOW,
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
      NOW,
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
        NOW,
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
        NOW,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      serviceWith({ trafo: twoPhase }).service.run(
        { action: 'DROP_PHASE', target: twoPhase.custom_id, channel: 'B' },
        ADMIN,
        NOW,
      ),
    ).resolves.toMatchObject({ event_code: '051421B' });
  });

  it('409 for an action that repeats the current state (alarms first, then telemetry)', async () => {
    await expect(
      serviceWith({ latest: 'SET' }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
        NOW,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWith().service.run(
        { action: 'CLOSE_FUSE', target: FUSE.custom_id },
        ADMIN,
        NOW,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      serviceWith({ fuse: { ...FUSE, fuse_state: 'Abierto' } }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
        NOW,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('404 for an unknown target or one outside the scope; 400 for a fuse without a Falcon', async () => {
    await expect(
      serviceWith({ fuse: null }).service.run(
        { action: 'OPEN_FUSE', target: 'X' },
        ADMIN,
        NOW,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      serviceWith({ inScope: false }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        { kind: 'restricted', userId: 2 },
        NOW,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      serviceWith({ fuse: { ...FUSE, hw_id: null } }).service.run(
        { action: 'OPEN_FUSE', target: FUSE.custom_id },
        ADMIN,
        NOW,
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

    await expect(service.run(body as never, ADMIN, NOW)).rejects.toThrow(
      message,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
