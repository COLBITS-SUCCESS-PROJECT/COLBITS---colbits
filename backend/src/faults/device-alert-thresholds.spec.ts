import {
  DEFAULT_OVERLOAD_PERCENT,
  DEFAULT_VOLTAGE_UNBALANCE_PERCENT,
  DEVICE_ALERT_SETTINGS,
  resolveDeviceAlertThresholds,
} from './device-alert-thresholds';

/** Reads settings from a plain object, as ConfigService.get does. */
const from = (settings: Record<string, unknown>) => (name: string) =>
  settings[name];

describe('device alert thresholds (NF-22, CL-05, TD-09, TD-10)', () => {
  it('defaults to 90 % overload and 2 % voltage imbalance, with no current-imbalance threshold', () => {
    expect(DEFAULT_OVERLOAD_PERCENT).toBe(90);
    expect(DEFAULT_VOLTAGE_UNBALANCE_PERCENT).toBe(2);

    const { thresholds } = resolveDeviceAlertThresholds(from({}));

    expect(thresholds).toEqual({
      overloadPercent: 90,
      voltageUnbalancePercent: 2,
      currentUnbalancePercent: null,
    });
  });

  it('takes configured values, as numbers or as the strings of an environment', () => {
    const { thresholds, warnings } = resolveDeviceAlertThresholds(
      from({
        SMAC_OVERLOAD_PERCENT: '80',
        SMAC_VOLTAGE_UNBALANCE_PERCENT: 2.5,
        SMAC_CURRENT_UNBALANCE_PERCENT: ' 10 ',
      }),
    );

    expect(thresholds).toEqual({
      overloadPercent: 80,
      voltageUnbalancePercent: 2.5,
      currentUnbalancePercent: 10,
    });
    expect(warnings).toEqual([]);
  });

  it('accepts an overload threshold above 100 (a load percentage can exceed it)', () => {
    const { thresholds } = resolveDeviceAlertThresholds(
      from({ SMAC_OVERLOAD_PERCENT: '110' }),
    );
    expect(thresholds.overloadPercent).toBe(110);
  });

  describe('TD-10: the current-imbalance threshold has no default', () => {
    it.each([undefined, null, '', '   '])(
      'is disabled, with a notice naming TD-10, when it is unset (%p)',
      (value) => {
        const { thresholds, warnings } = resolveDeviceAlertThresholds(
          from({ SMAC_CURRENT_UNBALANCE_PERCENT: value }),
        );

        expect(thresholds.currentUnbalancePercent).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('SMAC_CURRENT_UNBALANCE_PERCENT');
        expect(warnings[0]).toContain('TD-10');
      },
    );

    it.each(['abc', '0', '-3', 'Infinity', 'NaN', true, {}])(
      'is disabled, never defaulted, when it is invalid (%p)',
      (value) => {
        const { thresholds, warnings } = resolveDeviceAlertThresholds(
          from({ SMAC_CURRENT_UNBALANCE_PERCENT: value }),
        );

        expect(thresholds.currentUnbalancePercent).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('disabled');
      },
    );
  });

  describe('invalid overload and voltage-imbalance settings', () => {
    it.each(['abc', '0', '-90', 'Infinity', 'NaN', false, {}])(
      'fall back to the defaults and say so (%p)',
      (value) => {
        const { thresholds, warnings } = resolveDeviceAlertThresholds(
          from({
            SMAC_OVERLOAD_PERCENT: value,
            SMAC_VOLTAGE_UNBALANCE_PERCENT: value,
          }),
        );

        expect(thresholds.overloadPercent).toBe(90);
        expect(thresholds.voltageUnbalancePercent).toBe(2);
        expect(
          warnings.filter((w) => w.includes('using the default')),
        ).toHaveLength(2);
      },
    );

    it('treat an empty string (docker-compose passes unset variables through as empty) as unset, without a notice', () => {
      const { thresholds, warnings } = resolveDeviceAlertThresholds(
        from({
          SMAC_OVERLOAD_PERCENT: '',
          SMAC_VOLTAGE_UNBALANCE_PERCENT: '',
          SMAC_CURRENT_UNBALANCE_PERCENT: '10',
        }),
      );

      expect(thresholds.overloadPercent).toBe(90);
      expect(thresholds.voltageUnbalancePercent).toBe(2);
      expect(warnings).toEqual([]);
    });
  });

  it('reads exactly the three documented setting names', () => {
    const asked: string[] = [];
    resolveDeviceAlertThresholds((name) => {
      asked.push(name);
      return undefined;
    });

    expect(asked.sort()).toEqual(Object.values(DEVICE_ALERT_SETTINGS).sort());
    expect(DEVICE_ALERT_SETTINGS).toEqual({
      OVERLOAD: 'SMAC_OVERLOAD_PERCENT',
      VOLTAGE_UNBALANCE: 'SMAC_VOLTAGE_UNBALANCE_PERCENT',
      CURRENT_UNBALANCE: 'SMAC_CURRENT_UNBALANCE_PERCENT',
    });
  });
});
