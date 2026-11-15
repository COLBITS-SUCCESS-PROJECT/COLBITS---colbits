/**
 * Demo scenarios (US31 · F-100, SCRUM-252): what each action writes, as a real device would.
 *
 * A scenario never changes how the platform computes anything. It inserts one telemetry reading
 * and one alarm event with the Technical Annex §4.2 codes, exactly like a Falcon or a SMAC, so the
 * map (GET /nodes), the alarm list (GET /faults) and the node detail react through their normal
 * rules within one refresh. Javier's SCRUM-253 adds the other actions to SCENARIO_ACTIONS.
 */
export const SCENARIO_ACTIONS = {
  OPEN_FUSE: {
    device: 'FALCON',
    event: '20',
    eventType: 'SET',
    channel: false,
  },
  CLOSE_FUSE: {
    device: 'FALCON',
    event: '20',
    eventType: 'CLEAR',
    channel: false,
  },
  CUT_VOLTAGE: {
    device: 'FALCON',
    event: '21',
    eventType: 'SET',
    channel: false,
  },
  RESTORE_VOLTAGE: {
    device: 'FALCON',
    event: '21',
    eventType: 'CLEAR',
    channel: false,
  },
  DROP_PHASE: { device: 'SMAC', event: '21', eventType: 'SET', channel: true },
  RESTORE_PHASE: {
    device: 'SMAC',
    event: '21',
    eventType: 'CLEAR',
    channel: true,
  },
} as const satisfies Record<
  string,
  {
    device: 'FALCON' | 'SMAC';
    event: '20' | '21';
    eventType: 'SET' | 'CLEAR';
    channel: boolean;
  }
>;

export type ScenarioAction = keyof typeof SCENARIO_ACTIONS;
export const SCENARIO_ACTION_NAMES = Object.keys(
  SCENARIO_ACTIONS,
) as ScenarioAction[];
export const SMAC_CHANNELS = ['A', 'B', 'C'] as const;
export type ScenarioChannel = (typeof SMAC_CHANNELS)[number];

/** Setting that turns the scenarios on. Off by default: they write data (NF-03). */
export const DEMO_SCENARIOS_SETTING = 'DEMO_SCENARIOS_ENABLED';

/** Firmware digits used when the device has no previous event (seed and generator use 14). */
export const DEFAULT_FIRMWARE = '14';

/** Telemetry values written by the scenarios. */
export const OPEN_FUSE_ANGLE = 125;
export const CLOSED_FUSE_ANGLE = 1;
export const DROPPED_PHASE_VOLTS = 0;
export const NOMINAL_PHASE_VOLTS = 220;

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
  const { device, event } = SCENARIO_ACTIONS[action];
  return `${device === 'FALCON' ? '13' : '05'}${firmware}${event}${channel ?? ''}`;
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
      return String(NOMINAL_PHASE_VOLTS);
    default:
      return null;
  }
}

/**
 * Whether the action would repeat the current state: opening an open fuse, restoring a voltage
 * that was never cut... A repeated SET or CLEAR would break the alarm pairs the fault list reads,
 * so it is refused (409) instead.
 */
export function repeatsCurrentState(
  action: ScenarioAction,
  active: boolean,
): boolean {
  return SCENARIO_ACTIONS[action].eventType === 'SET' ? active : !active;
}

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
  }
}
