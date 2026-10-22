import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { DeviceService } from './device.service';

describe('DeviceService (US5 · F-36, F-37, F-46, NF-07)', () => {
  function makeService(
    rows: { node_id: string; recorded_at: Date | string | null }[],
    inScope = true,
    env: Record<string, string | undefined> = {},
  ) {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(inScope ? 1 : 0),
    };
    const repository = {
      query: jest.fn().mockResolvedValue(rows),
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<Node>;
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    return {
      service: new DeviceService(config, repository),
      repository,
      builder,
    };
  }

  it('marks a device with no record in the DB as inactive', async () => {
    const { service } = makeService([
      { node_id: '0000100001', recorded_at: null },
    ]);

    const res = await service.checkInactivity('1301000030', 'Falcon', {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(true);
    expect(res.lastRecordTimestamp).toBeNull();
    expect(res.hoursSilent).toBeNull();
  });

  it('reads the date from the DB and marks a Falcon silent > 9h as inactive', async () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 3600_000).toISOString();
    const { service } = makeService([
      { node_id: '0000100001', recorded_at: tenHoursAgo },
    ]);

    const res = await service.checkInactivity('1301000030', 'Falcon', {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(true);
    expect(res.thresholdHours).toBe(9);
  });

  it('marks a Falcon with a recent DB record as active', async () => {
    const oneHourAgo = new Date(Date.now() - 1 * 3600_000).toISOString();
    const { service } = makeService([
      { node_id: '0000100001', recorded_at: oneHourAgo },
    ]);

    const res = await service.checkInactivity('1301000001', 'Falcon', {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(false);
  });

  it('evaluates SMAC inactivity against the 3h threshold', async () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
    const { service } = makeService([
      { node_id: '0000100001', recorded_at: fourHoursAgo },
    ]);

    const res = await service.checkInactivity('2301000001', 'SMAC', {
      kind: 'unrestricted',
    });

    expect(res.thresholdHours).toBe(3);
    expect(res.isInactive).toBe(true);
  });

  it('throws 404 NotFoundException when the device does not exist', async () => {
    const { service } = makeService([]);

    await expect(
      service.checkInactivity('9999999999', 'Falcon', { kind: 'unrestricted' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws 404 NotFoundException when the device is outside the user scope', async () => {
    const { service } = makeService(
      [{ node_id: '0000100002', recorded_at: new Date().toISOString() }],
      false,
    );

    await expect(
      service.checkInactivity('1301000001', 'Falcon', {
        kind: 'restricted',
        userId: 2,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});