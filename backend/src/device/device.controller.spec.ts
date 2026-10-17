import { BadRequestException } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

describe('DeviceController', () => {
  const checkInactivity = jest.fn().mockReturnValue({ isInactive: false });
  const controller = new DeviceController({ checkInactivity } as unknown as DeviceService);

  beforeEach(() => checkInactivity.mockClear());

  it('passes a valid query to the service', () => {
    controller.getInactivityStatus('F1', 'Falcon', '2026-10-17T10:00:00Z');

    expect(checkInactivity).toHaveBeenCalledWith('F1', 'Falcon', '2026-10-17T10:00:00Z');
  });

  it('requires deviceId, type and lastTimestamp', () => {
    expect(() => controller.getInactivityStatus('', 'Falcon', 'x')).toThrow(BadRequestException);
    expect(checkInactivity).not.toHaveBeenCalled();
  });

  it('accepts only Falcon or SMAC', () => {
    expect(() => controller.getInactivityStatus('F1', 'Other', 'x')).toThrow('type must be Falcon or SMAC');
  });
});
