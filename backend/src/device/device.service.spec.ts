import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { DeviceService } from './device.service';

describe('DeviceService (US5 · F-36, F-37, F-46, NF-07)', () => {
  function makeService(
    rows: { node_id: string }[],
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

  it('derives an ISO last-record timestamp from the supplied hours', async () => {
    const { service } = makeService([{ node_id: '0000100001' }]);
    const before = Date.now();

    const res = await service.checkInactivity('1301000030', 'Falcon', 10, {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(true);
    expect(res.hoursSilent).toBe(10);
    expect(res.lastRecordTimestamp).toBeInstanceOf(Date);
    expect(
      Math.abs(res.lastRecordTimestamp!.getTime() - (before - 10 * 3600_000)),
    ).toBeLessThan(100);
  });

  it('marks a Falcon inactive only when its age is greater than 9h', async () => {
    const { service } = makeService([{ node_id: '0000100001' }]);

    const res = await service.checkInactivity('1301000030', 'Falcon', 9, {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(false);
    expect(res.thresholdHours).toBe(9);
  });

  it('marks a Falcon silent for less than 9h as active', async () => {
    const { service } = makeService([{ node_id: '0000100001' }]);

    const res = await service.checkInactivity('1301000001', 'Falcon', 1, {
      kind: 'unrestricted',
    });

    expect(res.isInactive).toBe(false);
  });

  it('evaluates SMAC inactivity against the 3h threshold', async () => {
    const { service } = makeService([{ node_id: '0000100001' }]);

    const res = await service.checkInactivity('2301000001', 'SMAC', 4, {
      kind: 'unrestricted',
    });

    expect(res.thresholdHours).toBe(3);
    expect(res.isInactive).toBe(true);
    expect(res.hoursSilent).toBe(4);
  });

  it('throws 404 NotFoundException when the device does not exist', async () => {
    const { service } = makeService([]);

    await expect(
      service.checkInactivity('9999999999', 'Falcon', 4, {
        kind: 'unrestricted',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws 404 NotFoundException when the device is outside the user scope', async () => {
    const { service } = makeService([{ node_id: '0000100002' }], false);

    await expect(
      service.checkInactivity('1301000001', 'Falcon', 4, {
        kind: 'restricted',
        userId: 2,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
