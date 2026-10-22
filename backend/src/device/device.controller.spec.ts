import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

describe('DeviceController', () => {
  const checkInactivity = jest.fn().mockResolvedValue({ isInactive: false });
  const resolve = jest.fn().mockResolvedValue({ kind: 'unrestricted' });
  const controller = new DeviceController(
    { checkInactivity } as unknown as DeviceService,
    { resolve } as unknown as ScopeService,
  );
  const mockReq = {
    user: { sub: 1, role: 'Colbits administrator' },
  } as unknown as Request;

  beforeEach(() => {
    checkInactivity.mockClear();
    resolve.mockClear();
  });

  it('resolves user scope and passes the query to the service', async () => {
    await controller.getInactivityStatus('1301000001', 'Falcon', mockReq);

    expect(resolve).toHaveBeenCalledWith(1);
    expect(checkInactivity).toHaveBeenCalledWith('1301000001', 'Falcon', {
      kind: 'unrestricted',
    });
  });

  it('rejects requests without a valid user identity (401)', async () => {
    await expect(
      controller.getInactivityStatus(
        '1301000001',
        'Falcon',
        {} as unknown as Request,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(checkInactivity).not.toHaveBeenCalled();
  });

  it('accepts only Falcon or SMAC', async () => {
    await expect(
      controller.getInactivityStatus('1301000001', 'Other', mockReq),
    ).rejects.toThrow(BadRequestException);
    expect(checkInactivity).not.toHaveBeenCalled();
  });
});