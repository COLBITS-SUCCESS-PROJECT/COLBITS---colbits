import { ConfigService } from '@nestjs/config';
import { DeviceService } from './device.service';

const NOW = new Date('2026-10-17T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

function serviceWith(env: Record<string, string | undefined>) {
  const config = { get: jest.fn((key: string) => env[key]) };
  return new DeviceService(config as unknown as ConfigService);
}

describe('DeviceService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('uses the default thresholds: 9 h for Falcon, 3 h for SMAC', () => {
    const service = serviceWith({});

    expect(service.checkInactivity('F1', 'Falcon', hoursAgo(8)).isInactive).toBe(false);
    expect(service.checkInactivity('F1', 'Falcon', hoursAgo(10)).isInactive).toBe(true);
    expect(service.checkInactivity('S1', 'SMAC', hoursAgo(2)).isInactive).toBe(false);
    expect(service.checkInactivity('S1', 'SMAC', hoursAgo(4)).isInactive).toBe(true);
  });

  it('reads the thresholds from the environment (NF-07)', () => {
    const service = serviceWith({ FALCON_INACTIVITY_HOURS: '12', SMAC_INACTIVITY_HOURS: '1' });

    expect(service.checkInactivity('F1', 'Falcon', hoursAgo(10)).thresholdHours).toBe(12);
    expect(service.checkInactivity('F1', 'Falcon', hoursAgo(10)).isInactive).toBe(false);
    expect(service.checkInactivity('S1', 'SMAC', hoursAgo(2)).isInactive).toBe(true);
  });

  it('is not inactive exactly at the threshold', () => {
    expect(serviceWith({}).checkInactivity('S1', 'SMAC', hoursAgo(3)).isInactive).toBe(false);
  });

  it('reports the silent hours from the stored timestamp (F-46)', () => {
    const result = serviceWith({}).checkInactivity('F1', 'Falcon', hoursAgo(5.5).toISOString());

    expect(result).toMatchObject({ deviceId: 'F1', deviceType: 'Falcon', hoursSilent: 5.5 });
  });
});
