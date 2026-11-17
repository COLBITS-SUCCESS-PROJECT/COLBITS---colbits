/**
 * Demo scenarios (US31 · F-100, SCRUM-252): what each action writes, as a real device would.
 *
 * A scenario never changes how the platform computes anything. It inserts one telemetry reading
 * and one alarm event with the Technical Annex §4.2 codes, exactly like a Falcon or a SMAC, so the
 * map (GET /nodes), the alarm list (GET /faults) and the node detail react through their normal
 * rules within one refresh. Javier's SCRUM-253 adds the other actions to SCENARIO_ACTIONS.
 *
 * SCRUM-253: every action has a `kind`, so actions that write differently can share the service:
 *  - `event`: one reading plus one SET or CLEAR alarm event (the six SCRUM-252 actions);
 *  - `telemetry`: one reading with the device's own fields changed, and optionally one MSG event
 *    (the device conditions whose origin is telemetry: low energy, overload, free fall, solar panel);
 *  - `silence`: the device stops or resumes reporting (inactivity).
 */
export const SCENARIO_ACTION_KINDS = ['event', 'telemetry', 'silence'] as const;
export type ScenarioActionKind = (typeof SCENARIO_ACTION_KINDS)[number];
export type ScenarioDevice = 'FALCON' | 'SMAC';

/** Reading plus one SET / CLEAR event with the Technical Annex §4.2 code (SCRUM-252). */
export interface EventScenarioActionDefinition {
  kind: 'event';
  device: ScenarioDevice;
  event: '20' | '21';
  eventType: 'SET' | 'CLEAR';
  channel: boolean;
}

/**
 * SCRUM-253: the device conditions a telemetry action starts or stops. Each one is read with the
 * rule of the alert that shows it, and owns its own reading fields (nothing else is changed):
 *  - FALCON_LOW_ENERGY: supercaps_per (F-44, GET /device/low-energy);
 *  - SMAC_LOW_ENERGY: battery_per (F-45, GET /device/low-energy);
 *  - OVERLOAD: load_percent only, never vuf / cuf (F-47, OVERLOAD_UNBALANCE in GET /faults);
 *  - FREE_FALL: is_free_fall_alarm, plus the 13xx01 MSG event when it starts (FREE_FALL);
 *  - SOLAR_PANEL: is_solar_panel_alarm and solar_panel (SOLAR_PANEL_FAILURE).
 */
export type TelemetryCondition =
  | 'FALCON_LOW_ENERGY'
  | 'SMAC_LOW_ENERGY'
  | 'OVERLOAD'
  | 'FREE_FALL'
  | 'SOLAR_PANEL';

/** Reading with the action's own fields changed; free fall also sends a 13xx01 MSG event. */
export interface TelemetryScenarioActionDefinition {
  kind: 'telemetry';
  device: ScenarioDevice;
  channel: false;
  condition: TelemetryCondition;
  /** true: the action starts the condition; false: it stops it. */
  starts: boolean;
  event?: '01';
  eventType?: 'MSG';
}

/** The device stops or resumes reporting. */
export interface SilenceScenarioActionDefinition {
  kind: 'silence';
  device: ScenarioDevice;
  channel: false;
  /** true: the device goes silent; false: it reports again. */
  starts: boolean;
}

export type ScenarioActionDefinition =
  | EventScenarioActionDefinition
  | TelemetryScenarioActionDefinition
  | SilenceScenarioActionDefinition;

// The order is the order of GET /scenarios: each start right before its stop, so the panel shows
// them as pairs (SCRUM-254 lists the actions of a target as they come).
export const SCENARIO_ACTIONS = {
  OPEN_FUSE: {
    kind: 'event',
    device: 'FALCON',
    event: '20',
    eventType: 'SET',
    channel: false,
  },
  CLOSE_FUSE: {
    kind: 'event',
    device: 'FALCON',
    event: '20',
    eventType: 'CLEAR',
    channel: false,
  },
  CUT_VOLTAGE: {
    kind: 'event',
    device: 'FALCON',
    event: '21',
    eventType: 'SET',
    channel: false,
  },
  RESTORE_VOLTAGE: {
    kind: 'event',
    device: 'FALCON',
    event: '21',
    eventType: 'CLEAR',
    channel: false,
  },
  DROP_PHASE: {
    kind: 'event',
    device: 'SMAC',
    event: '21',
    eventType: 'SET',
    channel: true,
  },
  RESTORE_PHASE: {
    kind: 'event',
    device: 'SMAC',
    event: '21',
    eventType: 'CLEAR',
    channel: true,
  },
  PHASE_OUT_OF_RANGE: {
    kind: 'event',
    device: 'SMAC',
    event: '20',
    eventType: 'SET',
    channel: true,
  },
  PHASE_IN_RANGE: {
    kind: 'event',
    device: 'SMAC',
    event: '20',
    eventType: 'CLEAR',
    channel: true,
  },
  DRAIN_SUPERCAPS: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'FALCON_LOW_ENERGY',
    starts: true,
  },
  RECHARGE_SUPERCAPS: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'FALCON_LOW_ENERGY',
    starts: false,
  },
  FREE_FALL: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'FREE_FALL',
    starts: true,
    event: '01',
    eventType: 'MSG',
  },
  END_FREE_FALL: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'FREE_FALL',
    starts: false,
  },
  SOLAR_PANEL_ALARM: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'SOLAR_PANEL',
    starts: true,
  },
  CLEAR_SOLAR_PANEL_ALARM: {
    kind: 'telemetry',
    device: 'FALCON',
    channel: false,
    condition: 'SOLAR_PANEL',
    starts: false,
  },
  DRAIN_BATTERY: {
    kind: 'telemetry',
    device: 'SMAC',
    channel: false,
    condition: 'SMAC_LOW_ENERGY',
    starts: true,
  },
  RECHARGE_BATTERY: {
    kind: 'telemetry',
    device: 'SMAC',
    channel: false,
    condition: 'SMAC_LOW_ENERGY',
    starts: false,
  },
  START_OVERLOAD: {
    kind: 'telemetry',
    device: 'SMAC',
    channel: false,
    condition: 'OVERLOAD',
    starts: true,
  },
  END_OVERLOAD: {
    kind: 'telemetry',
    device: 'SMAC',
    channel: false,
    condition: 'OVERLOAD',
    starts: false,
  },
  SILENCE_FALCON: {
    kind: 'silence',
    device: 'FALCON',
    channel: false,
    starts: true,
  },
  RESUME_FALCON: {
    kind: 'silence',
    device: 'FALCON',
    channel: false,
    starts: false,
  },
  SILENCE_SMAC: {
    kind: 'silence',
    device: 'SMAC',
    channel: false,
    starts: true,
  },
  RESUME_SMAC: {
    kind: 'silence',
    device: 'SMAC',
    channel: false,
    starts: false,
  },
} as const satisfies Record<string, ScenarioActionDefinition>;

export type ScenarioAction = keyof typeof SCENARIO_ACTIONS;

/** The definition of an action as the general union, so the service can dispatch on `kind`. */
export function scenarioActionDefinition(
  action: ScenarioAction,
): ScenarioActionDefinition {
  return SCENARIO_ACTIONS[action];
}
export const SCENARIO_ACTION_NAMES = Object.keys(
  SCENARIO_ACTIONS,
) as ScenarioAction[];
export const SMAC_CHANNELS = ['A', 'B', 'C'] as const;
export type ScenarioChannel = (typeof SMAC_CHANNELS)[number];

/** Setting that turns the scenarios on. Off by default: they write data (NF-03). */
export const DEMO_SCENARIOS_SETTING = 'DEMO_SCENARIOS_ENABLED';

/**
 * SCRUM-253: setting that names the one database scenarios may write to. It must equal the
 * database the API is connected to (current_database()). Unset means no database is designated.
 */
export const DEMO_SCENARIOS_DATABASE_SETTING = 'DEMO_SCENARIOS_DATABASE';

/** Firmware digits used when the device has no previous event (seed and generator use 14). */
export const DEFAULT_FIRMWARE = '14';

/** Telemetry values written by the scenarios. */
export const OPEN_FUSE_ANGLE = 125;
export const CLOSED_FUSE_ANGLE = 1;
export const DROPPED_PHASE_VOLTS = 0;
export const NOMINAL_PHASE_VOLTS = 220;
/** A phase voltage out of its range (above nominal): the phase is still present, unlike a drop. */
export const OUT_OF_RANGE_PHASE_VOLTS = 250;

/**
 * SCRUM-253: values of the telemetry actions, always derived from the configured thresholds
 * (FALCON_LOW_ENERGY_PERCENT, SMAC_LOW_ENERGY_PERCENT, SMAC_OVERLOAD_PERCENT), never fixed. A stop
 * writes back the device's last value from before the condition when there is one, and the
 * fallback below otherwise. supercaps_per and battery_per are integer columns.
 */
export const SOLAR_PANEL_FAILED = 0;

/** A drained level: 20 points under the threshold, never below 0, always below the threshold. */
export function drainedEnergyLevel(thresholdPercent: number): number {
  return Math.max(0, Math.ceil(thresholdPercent) - 20);
}

/** A recharged level when the device has none from before: at least 80, never above 100. */
export function rechargedEnergyLevel(thresholdPercent: number): number {
  return Math.min(100, Math.max(80, Math.ceil(thresholdPercent) + 20));
}

/** An overloaded load: 25 points above the threshold (115 % with the default 90 %). */
export function overloadedLoad(thresholdPercent: number): number {
  return thresholdPercent + 25;
}

/** A normal load when the transformer has none from before: 30 points under the threshold. */
export function normalLoad(thresholdPercent: number): number {
  return Math.max(0, thresholdPercent - 30);
}

export function isScenarioAction(value: unknown): value is ScenarioAction {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SCENARIO_ACTIONS, value)
  );
}

export function isScenarioChannel(value: unknown): value is ScenarioChannel {
  return (
    typeof value === 'string' &&
    (SMAC_CHANNELS as readonly string[]).includes(value)
  );
}

/** Annex §4.2 event code: device prefix (13 / 05) + firmware + event (+ channel on SMAC). */
export function eventCodeOf(
  action: ScenarioAction,
  firmware: string,
  channel: ScenarioChannel | null,
): string {
  const definition = scenarioActionDefinition(action);
  if (definition.kind === 'silence' || definition.event === undefined) {
    throw new Error(`${action} sends no alarm event`);
  }
  return `${definition.device === 'FALCON' ? '13' : '05'}${firmware}${definition.event}${channel ?? ''}`;
}

/** Alarm text as Colbits' devices write it (seed data, Spanish). */
export function alarmTextOf(
  action: ScenarioAction,
  channel: ScenarioChannel | null,
): string {
  switch (action) {
    case 'OPEN_FUSE':
      return 'Fusible abierto';
    case 'CLOSE_FUSE':
      return 'Fusible cerrado';
    case 'CUT_VOLTAGE':
      return 'Ausencia de tensión';
    case 'RESTORE_VOLTAGE':
      return 'Tensión normalizada';
    case 'DROP_PHASE':
      return `Caída de la fase ${channel}`;
    case 'RESTORE_PHASE':
      return `Recuperación de la fase ${channel}`;
    case 'PHASE_OUT_OF_RANGE':
      return `Fase ${channel} fuera de rango`;
    case 'PHASE_IN_RANGE':
      return `Fase ${channel} dentro de rango`;
    case 'FREE_FALL':
      return 'Movimiento anormal detectado';
    default:
      throw new Error(`${action} sends no alarm event`);
  }
}

/** Value column of the alarm: the angle of a fuse holder, the voltage of a phase. */
export function alarmValueOf(action: ScenarioAction): string | null {
  switch (action) {
    case 'OPEN_FUSE':
      return `${OPEN_FUSE_ANGLE}°`;
    case 'CLOSE_FUSE':
      return `${CLOSED_FUSE_ANGLE}°`;
    case 'DROP_PHASE':
      return String(DROPPED_PHASE_VOLTS);
    case 'RESTORE_PHASE':
    case 'PHASE_IN_RANGE':
      return String(NOMINAL_PHASE_VOLTS);
    case 'PHASE_OUT_OF_RANGE':
      return String(OUT_OF_RANGE_PHASE_VOLTS);
    default:
      return null;
  }
}

/** Whether the action switches its condition on (a SET, a start) or off (a CLEAR, a stop). */
function switchesOn(action: ScenarioAction): boolean {
  const definition = scenarioActionDefinition(action);
  return definition.kind === 'event'
    ? definition.eventType === 'SET'
    : definition.starts;
}

/**
 * Whether the action would repeat the current state: opening an open fuse, restoring a voltage
 * that was never cut... A repeated SET or CLEAR would break the alarm pairs the fault list reads,
 * so it is refused (409) instead. SCRUM-253: the same for every start and stop of a condition.
 */
export function repeatsCurrentState(
  action: ScenarioAction,
  active: boolean,
): boolean {
  return switchesOn(action) ? active : !active;
}

/**
 * SCRUM-253: how the 409 of a telemetry action names the state it found: [subject, when on,
 * when off], as in "the SMAC battery is already low".
 */
export const TELEMETRY_CONDITION_STATES: Readonly<
  Record<TelemetryCondition, readonly [string, string, string]>
> = {
  FALCON_LOW_ENERGY: [
    'the Falcon supercapacitor charge',
    'low',
    'at or above the low-energy threshold',
  ],
  SMAC_LOW_ENERGY: [
    'the SMAC battery',
    'low',
    'at or above the low-energy threshold',
  ],
  OVERLOAD: [
    'the transformer load',
    'above the overload threshold',
    'at or below the overload threshold',
  ],
  FREE_FALL: ['free fall', 'active', 'not active'],
  SOLAR_PANEL: ['the solar-panel alarm', 'on', 'off'],
};

/** What the platform shows after the action, for the panel and for testers. */
export function expectedEffectOf(action: ScenarioAction): string {
  switch (action) {
    case 'OPEN_FUSE':
      return 'Fuse layer: node CRITICAL (red); an open FUSE_OPENING fault in GET /faults.';
    case 'CLOSE_FUSE':
      return 'The FUSE_OPENING fault resolves; the node returns to its other states.';
    case 'CUT_VOLTAGE':
      return 'Fuse layer: node WARNING (yellow) unless a fuse is open; an open NO_VOLTAGE alarm.';
    case 'RESTORE_VOLTAGE':
      return 'The NO_VOLTAGE alarm resolves.';
    case 'DROP_PHASE':
      return 'Transformer layer: WARNING with one phase down, CRITICAL with two or more; an open PHASE_LOSS alarm.';
    case 'RESTORE_PHASE':
      return 'The PHASE_LOSS alarm resolves; the transformer state is recomputed.';
    case 'PHASE_OUT_OF_RANGE':
      return 'Transformer layer: the phase stays present (the transformer state does not change); an open PHASE_OUT_OF_RANGE alarm and the "phase out of range" counter.';
    case 'PHASE_IN_RANGE':
      return 'The PHASE_OUT_OF_RANGE alarm resolves.';
    case 'DRAIN_SUPERCAPS':
      return 'The Falcon supercapacitors drop below FALCON_LOW_ENERGY_PERCENT: a low-energy alert in GET /device/low-energy. Telemetry only, no alarm event.';
    case 'RECHARGE_SUPERCAPS':
      return 'The Falcon supercapacitors are back at or above the threshold: the low-energy alert ends.';
    case 'FREE_FALL':
      return 'The Falcon reports abnormal movement (a 13xx01 MSG event and is_free_fall_alarm = true): a FREE_FALL alert in GET /faults.';
    case 'END_FREE_FALL':
      return 'A later Falcon reading with is_free_fall_alarm = false: the FREE_FALL alert ends.';
    case 'SOLAR_PANEL_ALARM':
      return 'The Falcon reports a solar-panel failure (is_solar_panel_alarm = true, solar_panel = 0): a SOLAR_PANEL_FAILURE alert in GET /faults. Telemetry only.';
    case 'CLEAR_SOLAR_PANEL_ALARM':
      return 'The Falcon reports is_solar_panel_alarm = false: the SOLAR_PANEL_FAILURE alert ends.';
    case 'DRAIN_BATTERY':
      return 'The SMAC battery drops below SMAC_LOW_ENERGY_PERCENT: a low-energy alert in GET /device/low-energy. Telemetry only, no alarm event.';
    case 'RECHARGE_BATTERY':
      return 'The SMAC battery is back at or above the threshold: the low-energy alert ends.';
    case 'START_OVERLOAD':
      return 'The transformer load goes above SMAC_OVERLOAD_PERCENT: an OVERLOAD_UNBALANCE alert with the OVERLOAD condition in GET /faults. Imbalance values are kept as they are.';
    case 'END_OVERLOAD':
      return 'The load is back at or below the threshold: the OVERLOAD condition ends; the alert stays while a voltage or current imbalance remains.';
    case 'SILENCE_FALCON':
      return 'The Falcon stops reporting: its readings of the last FALCON_INACTIVITY_HOURS (plus one minute) are removed, so it is inactive in GET /device/inactive and its node turns gray. Refused while another scenario is active on it.';
    case 'RESUME_FALCON':
      return 'The Falcon reports again (one reading, copied from its last one): it is active again, and the silence stays in its inactivity history.';
    case 'SILENCE_SMAC':
      return 'The SMAC stops reporting: its readings of the last SMAC_INACTIVITY_HOURS (plus one minute) are removed from its three tables, so it is inactive in GET /device/inactive and its transformer turns gray. Refused while another scenario is active on it.';
    case 'RESUME_SMAC':
      return 'The SMAC reports again (one reading, copied from its last one): it is active again, and the silence stays in its inactivity history.';
  }
}

/**
 * SCRUM-253: SILENCE removes the readings of the last threshold plus this margin, so the device's
 * latest remaining record is clearly older than the inactivity threshold (strictly "more than").
 */
export const SILENCE_MARGIN_MS = 60_000;

/** SCRUM-253: the cutoff of a SILENCE: readings after it are removed, the baseline is at or before it. */
export function silenceCutoff(databaseNow: Date, thresholdHours: number): Date {
  return new Date(
    databaseNow.getTime() - thresholdHours * 3_600_000 - SILENCE_MARGIN_MS,
  );
}
