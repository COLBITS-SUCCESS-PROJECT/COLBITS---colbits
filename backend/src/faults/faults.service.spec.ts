import { ConfigService } from '@nestjs/config';
import { FaultsService } from './faults.service';

// #CORRECTION CL-13 (2026-11-09): the getActiveFaults() test was removed with the method; a fallback test was added.
describe('FaultsService (NF-09)', () => {
  const serviceWith = (value: unknown) =>
    new FaultsService({
      get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService);

  it('reads the grouping window from ConfigService without code changes (NF-09)', () => {
    expect(serviceWith('10').getGroupingWindowMinutes()).toBe(10);
  });

  it('falls back to 5 minutes when the window is missing or invalid', () => {
    expect(serviceWith(undefined).getGroupingWindowMinutes()).toBe(5);
    expect(serviceWith('-1').getGroupingWindowMinutes()).toBe(5);
  });

  describe('low-energy thresholds (NF-08)', () => {
    const withSettings = (settings: Record<string, unknown>) =>
      new FaultsService({
        get: jest.fn((key: string) => settings[key]),
      } as unknown as ConfigService);

    it('defaults to 30 % for both device types', () => {
      expect(withSettings({}).getLowEnergyThresholds()).toEqual({
        falcon: 30,
        smac: 30,
      });
    });

    it('reads each device type from its own setting, without code changes', () => {
      expect(
        withSettings({
          FALCON_LOW_ENERGY_PERCENT: '45',
          SMAC_LOW_ENERGY_PERCENT: '12.5',
        }).getLowEnergyThresholds(),
      ).toEqual({ falcon: 45, smac: 12.5 });
    });

    it.each(['0', '-5', '101', 'abc', '', 'NaN', 'Infinity'])(
      'falls back to 30 for the invalid value %p, like GET /device/low-energy',
      (value) => {
        expect(
          withSettings({
            FALCON_LOW_ENERGY_PERCENT: value,
            SMAC_LOW_ENERGY_PERCENT: value,
          }).getLowEnergyThresholds(),
        ).toEqual({ falcon: 30, smac: 30 });
      },
    );

    it('accepts 100 as the highest threshold', () => {
      expect(
        withSettings({ FALCON_LOW_ENERGY_PERCENT: '100' }).getLowEnergyThresholds()
          .falcon,
      ).toBe(100);
    });

    it('is read on every call, so a changed setting applies to the next request', () => {
      const settings: Record<string, unknown> = {};
      const service = withSettings(settings);

      expect(service.getLowEnergyThresholds().falcon).toBe(30);
      settings.FALCON_LOW_ENERGY_PERCENT = '20';
      expect(service.getLowEnergyThresholds().falcon).toBe(20);
    });
  });

  describe('inactivity thresholds (NF-07)', () => {
    const withSettings = (settings: Record<string, unknown>) =>
      new FaultsService({
        get: jest.fn((key: string) => settings[key]),
      } as unknown as ConfigService);

    it('defaults to 9 h for a Falcon and 3 h for a SMAC', () => {
      expect(withSettings({}).getInactivityHours()).toEqual({
        falcon: 9,
        smac: 3,
      });
    });

    it('reads each device type from its own setting', () => {
      expect(
        withSettings({
          FALCON_INACTIVITY_HOURS: '12',
          SMAC_INACTIVITY_HOURS: '1.5',
        }).getInactivityHours(),
      ).toEqual({ falcon: 12, smac: 1.5 });
    });

    it.each(['0', '-1', 'abc', 'NaN', 'Infinity'])(
      'falls back to the default for the invalid value %p, exactly as GET /device/inactive does',
      (value) => {
        expect(
          withSettings({
            FALCON_INACTIVITY_HOURS: value,
            SMAC_INACTIVITY_HOURS: value,
          }).getInactivityHours(),
        ).toEqual({ falcon: 9, smac: 3 });
      },
    );
  });
});
