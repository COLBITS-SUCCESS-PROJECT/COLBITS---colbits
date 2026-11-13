/**
 * Low device energy (NF-08, F-44, F-45; Scope v6.0 §3.2). Falcon devices keep energy in
 * supercapacitors (`supercaps_per`) and SMAC devices in a battery (`battery_per`), both percentages
 * (client answer CL-11). A level below the threshold is low; the client recommends 30 % for both.
 * The thresholds are settings (NF-08), never hard-coded in the rules that use them.
 */
export type DeviceKind = 'FALCON' | 'SMAC';

/** Recommended threshold (CL-11, Colbits, 3 Nov 2026), used when the setting is missing or invalid. */
export const DEFAULT_LOW_ENERGY_PERCENT = 30;

/** Setting that overrides the threshold of each device type (NF-08). */
export const LOW_ENERGY_SETTINGS: Readonly<Record<DeviceKind, string>> = {
  FALCON: 'FALCON_LOW_ENERGY_PERCENT',
  SMAC: 'SMAC_LOW_ENERGY_PERCENT',
};

/** A configured percentage when it is a number in (0, 100]; otherwise the recommended default. */
export function lowEnergyThreshold(configured: unknown): number {
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 && value <= 100
    ? value
    : DEFAULT_LOW_ENERGY_PERCENT;
}

/** Whether a stored energy level is low ("falls below the threshold"); null when there is no level. */
export function isLowEnergy(
  level: number | null,
  thresholdPercent: number,
): boolean | null {
  return level === null ? null : level < thresholdPercent;
}
