/**
 * Alert types of the active fault list (US10 · F-47, Scope v6.0 §3.2 / RF-ALR-01) and the
 * classification of an `alarms.event_code` (Technical Annex v1.1 §4.2).
 * F-47 is a whitelist: the list holds these types "and no others". It adds no detection; a type
 * without a documented event code is never produced from one, and nothing is mapped by guessing.
 *
 * Tampering is deferred by Scope §3.2 (no field or event code yet), so it is not a type here.
 */
export const ALERT_TYPES = [
  'FUSE_OPENING',
  'NO_VOLTAGE',
  'FREE_FALL',
  'SOLAR_PANEL_FAILURE',
  'PHASE_LOSS',
  'PHASE_OUT_OF_RANGE',
  'OVERLOAD_UNBALANCE',
  'LOW_ENERGY',
  'DEVICE_INACTIVITY',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Result for an event code outside Annex §4.2: surfaced as such, never mapped to a type. */
export const UNRECOGNIZED = 'UNRECOGNIZED' as const;
export type EventCodeClass = AlertType | typeof UNRECOGNIZED;

export interface AlertTypeDefinition {
  /** Scope §3.2: the device type that originates it. */
  devices: readonly ('FALCON' | 'SMAC')[];
  /**
   * Annex §4.2 event code as an anchored regular expression that is valid both in JavaScript and
   * in PostgreSQL (`~`). null when the type has no documented event code (flag, measurement or
   * derived origin), so no code can ever be classified as that type.
   */
  eventCodePattern: string | null;
}

/**
 * xx = two-digit firmware version (Annex §4.2, "14 = v1.4"); y = one channel or phase character
 * on SMAC codes (Annex Figure 5: "char 7 (optional)", no set of values given). The Annex text calls
 * it a "digit", while the seed and the generator use A, B, C, and the schema only says `text`.
 * So y is matched as one ASCII letter or digit and never interpreted: the type comes from the
 * event characters (20 / 21), so a different channel value cannot change the result.
 */
export const ALERT_TYPE_DEFINITIONS: Readonly<
  Record<AlertType, AlertTypeDefinition>
> = {
  // Fuse-alarm flag and state in telemetry; opening and closing events in `alarms` (13xx20).
  FUSE_OPENING: { devices: ['FALCON'], eventCodePattern: '^13[0-9]{2}20$' },
  // Voltage-presence flag in telemetry; voltage-alarm event codes (13xx21).
  NO_VOLTAGE: { devices: ['FALCON'], eventCodePattern: '^13[0-9]{2}21$' },
  // Free-fall flag; abnormal-movement event code (13xx01, "possible fall or tampering").
  FREE_FALL: { devices: ['FALCON'], eventCodePattern: '^13[0-9]{2}01$' },
  // Solar-panel flag and measurement in telemetry: no event code.
  SOLAR_PANEL_FAILURE: { devices: ['FALCON'], eventCodePattern: null },
  // Per-channel event codes, activation and deactivation (05xx21y).
  PHASE_LOSS: {
    devices: ['SMAC'],
    eventCodePattern: '^05[0-9]{2}21[0-9A-Za-z]$',
  },
  // Per-channel event codes, activation and deactivation (05xx20y).
  PHASE_OUT_OF_RANGE: {
    devices: ['SMAC'],
    eventCodePattern: '^05[0-9]{2}20[0-9A-Za-z]$',
  },
  // Load percentage and imbalance factors in transformer telemetry: no event code.
  OVERLOAD_UNBALANCE: { devices: ['SMAC'], eventCodePattern: null },
  // Low supercapacitor (Falcon) or battery (SMAC) level in telemetry: no event code.
  LOW_ENERGY: { devices: ['FALCON', 'SMAC'], eventCodePattern: null },
  // Derived from the absence of records; the device emits no alarm for it.
  DEVICE_INACTIVITY: { devices: ['FALCON', 'SMAC'], eventCodePattern: null },
};

const CODE_MATCHERS: readonly { type: AlertType; matcher: RegExp }[] =
  ALERT_TYPES.flatMap((type) => {
    const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
    return eventCodePattern === null
      ? []
      : [{ type, matcher: new RegExp(eventCodePattern) }];
  });

/**
 * Alert type of an `alarms.event_code`, or UNRECOGNIZED when it matches no Annex §4.2 pattern
 * (including anything that is not a text). Only surrounding whitespace is removed; the text is not
 * case-folded, because that can turn non-ASCII letters into ASCII ones (`ı`, `ſ` become `I`, `S`).
 */
export function classifyEventCode(code: string): EventCodeClass {
  if (typeof code !== 'string') return UNRECOGNIZED;
  const normalized = code.trim();
  const found = CODE_MATCHERS.find(({ matcher }) => matcher.test(normalized));
  return found ? found.type : UNRECOGNIZED;
}
