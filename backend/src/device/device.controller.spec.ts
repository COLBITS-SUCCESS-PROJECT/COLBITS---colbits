import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { InactiveDevicesService } from './inactive-devices.service';
import { LowEnergyAlertsService } from './low-energy-alerts.service';

describe('DeviceController', () => {
  const checkInactivity = jest.fn().mockResolvedValue({ isInactive: false });
  const resolve = jest.fn().mockResolvedValue({ kind: 'unrestricted' });
  const inactiveDevices = jest
    .fn()
    .mockResolvedValue({ count: 0, devices: [] });
  const controller = new DeviceController(
    { checkInactivity } as unknown as DeviceService,
    { resolve } as unknown as ScopeService,
    { inactiveDevices } as unknown as InactiveDevicesService,
    {} as unknown as LowEnergyAlertsService,
  );
  const mockReq = {
    user: { sub: 1, role: 'Colbits administrator' },
  } as unknown as Request;

  beforeEach(() => {
    checkInactivity.mockClear();
    resolve.mockClear();
  });

  it('resolves user scope and passes query parameters to the service', async () => {
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

  it('requires a non-empty deviceId', async () => {
    await expect(
      controller.getInactivityStatus('   ', 'Falcon', mockReq),
    ).rejects.toThrow(BadRequestException);
    expect(checkInactivity).not.toHaveBeenCalled();
  });

  it('accepts only Falcon or SMAC', async () => {
    await expect(
      controller.getInactivityStatus('1301000001', 'Other', mockReq),
    ).rejects.toThrow(BadRequestException);
    expect(checkInactivity).not.toHaveBeenCalled();
  });
});

describe('DeviceController.getInactiveDevices (US17 · F-40)', () => {
  const resolve = jest
    .fn()
    .mockResolvedValue({ kind: 'restricted', userId: 2 });
  const inactiveDevices = jest
    .fn()
    .mockResolvedValue({ count: 0, devices: [] });
  const activeAlerts = jest.fn().mockResolvedValue({ count: 0, alerts: [] });
  const controller = new DeviceController(
    {} as unknown as DeviceService,
    { resolve } as unknown as ScopeService,
    { inactiveDevices } as unknown as InactiveDevicesService,
    { activeAlerts } as unknown as LowEnergyAlertsService,
  );
  const request = { user: { sub: 2 } } as unknown as Request;

  beforeEach(() => jest.clearAllMocks());

  it('uses the scope of the user in the token and a 24 h window by default', async () => {
    await controller.getInactiveDevices(undefined, request);

    expect(resolve).toHaveBeenCalledWith(2);
    expect(inactiveDevices).toHaveBeenCalledWith(
      { kind: 'restricted', userId: 2 },
      24,
    );
  });

  it('passes a valid window in hours', async () => {
    await controller.getInactiveDevices('1', request);

    expect(inactiveDevices).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it.each(['0', '-3', 'abc', '721'])(
    'rejects hours=%s before querying',
    async (hours) => {
      await expect(
        controller.getInactiveDevices(hours, request),
      ).rejects.toThrow(BadRequestException);
      expect(inactiveDevices).not.toHaveBeenCalled();
    },
  );

  it('F-44/F-45: reads the low-energy alerts inside the user scope', async () => {
    await controller.getLowEnergyAlerts(request);

    expect(resolve).toHaveBeenCalledWith(2);
    expect(activeAlerts).toHaveBeenCalledWith({
      kind: 'restricted',
      userId: 2,
    });
  });

  it('rejects a request without a valid user', async () => {
    await expect(
      controller.getInactiveDevices(undefined, {
        user: { sub: '2' },
      } as unknown as Request),
    ).rejects.toThrow(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });
});
