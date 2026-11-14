/**
 * Thresholds of the transformer overload and imbalance alert (SCRUM-245 · F-47, NF-22;
 * Scope v6.0 §3.2). The SMAC reports three calculated percentages that are compared with a
 * threshold exactly as stored, never recomputed (TD-08):
 *
 *   load_percent  above 90 %  → overload             (CL-05)
 *   vuf_percent   above  2 %  → voltage imbalance    (TD-09, EN 50160 limit)
 *   cuf_percent   above ?     → current imbalance    (TD-10: NO approved value)
 *
 * Every threshold is a setting, never hard-coded in the rules that use it (NF-22).
 *
 * TD-10 is unresolved: Colbits gave no reference value (CL-06) and the team has not agreed one, so
 * no default is invented. While SMAC_CURRENT_UNBALANCE_PERCENT is unset the current-imbalance
 * condition is disabled: a transformer is never reported for its `cuf_percent`. Setting the
 * variable is all it takes to enable it.
 */
export const DEVICE_ALERT_SETTINGS = {
  OVERLOAD: 'SMAC_OVERLOAD_PERCENT',
  VOLTAGE_UNBALANCE: 'SMAC_VOLTAGE_UNBALANCE_PERCENT',
  CURRENT_UNBALANCE: 'SMAC_CURRENT_UNBALANCE_PERCENT',
} as const;

/** Overload: above 90 % of rated power (CL-05, Colbits, 3 Nov 2026). */
export const DEFAULT_OVERLOAD_PERCENT = 90;

/** Voltage imbalance: above 2 % (TD-09, team decision; the EN 50160 voltage-unbalance limit). */
export const DEFAULT_VOLTAGE_UNBALANCE_PERCENT = 2;

export interface DeviceAlertThresholds {
  overloadPercent: number;
  voltageUnbalancePercent: number;
  /** null while TD-10 has no value: the current-imbalance condition is disabled. */
  currentUnbalancePercent: number | null;
}

export interface ResolvedDeviceAlertThresholds {
  thresholds: DeviceAlertThresholds;
  /** Human-readable notices for the log: invalid settings and the disabled TD-10 condition. */
  warnings: string[];
}

type ParsedSetting =
  { kind: 'unset' } | { kind: 'invalid' } | { kind: 'value'; value: number };

/**
 * A setting is unset when it is missing or an empty string (docker-compose passes an unset variable
 * through as ''), a value when it is a finite number above zero, and invalid otherwise. There is no
 * upper bound: load_percent can legitimately exceed 100.
 */
function parseSetting(raw: unknown): ParsedSetting {
  if (raw === undefined || raw === null) return { kind: 'unset' };
  if (typeof raw === 'string' && raw.trim() === '') return { kind: 'unset' };
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { kind: 'invalid' };
  }
  const value = Number(typeof raw === 'string' ? raw.trim() : raw);
  return Number.isFinite(value) && value > 0
    ? { kind: 'value', value }
    : { kind: 'invalid' };
}

/**
 * The three thresholds from the settings. `read` gives the raw value of a setting by name (the
 * service passes ConfigService.get).
 *
 * - SMAC_OVERLOAD_PERCENT and SMAC_VOLTAGE_UNBALANCE_PERCENT: the default (90 / 2) when unset; the
 *   default plus a warning when set to something that is not a number above zero.
 * - SMAC_CURRENT_UNBALANCE_PERCENT: no default. Unset or invalid disables the condition, and the
 *   warnings say so.
 */
export function resolveDeviceAlertThresholds(
  read: (setting: string) => unknown,
): ResolvedDeviceAlertThresholds {
  const warnings: string[] = [];

  const withDefault = (setting: string, fallback: number): number => {
    const parsed = parseSetting(read(setting));
    if (parsed.kind === 'value') return parsed.value;
    if (parsed.kind === 'invalid') {
      warnings.push(
        `${setting} is not a number above zero: using the default ${fallback}`,
      );
    }
    return fallback;
  };

  const overloadPercent = withDefault(
    DEVICE_ALERT_SETTINGS.OVERLOAD,
    DEFAULT_OVERLOAD_PERCENT,
  );
  const voltageUnbalancePercent = withDefault(
    DEVICE_ALERT_SETTINGS.VOLTAGE_UNBALANCE,
    DEFAULT_VOLTAGE_UNBALANCE_PERCENT,
  );

  const current = parseSetting(read(DEVICE_ALERT_SETTINGS.CURRENT_UNBALANCE));
  let currentUnbalancePercent: number | null = null;
  if (current.kind === 'value') {
    currentUnbalancePercent = current.value;
  } else if (current.kind === 'invalid') {
    warnings.push(
      `${DEVICE_ALERT_SETTINGS.CURRENT_UNBALANCE} is not a number above zero: the current-imbalance condition is disabled`,
    );
  } else {
    warnings.push(
      `${DEVICE_ALERT_SETTINGS.CURRENT_UNBALANCE} is not set: the current-imbalance condition is disabled until the team approves a threshold (TD-10)`,
    );
  }

  return {
    thresholds: {
      overloadPercent,
      voltageUnbalancePercent,
      currentUnbalancePercent,
    },
    warnings,
  };
}
