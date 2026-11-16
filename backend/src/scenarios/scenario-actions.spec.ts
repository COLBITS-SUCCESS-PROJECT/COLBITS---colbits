import {
  SCENARIO_ACTIONS,
  SCENARIO_ACTION_KINDS,
  SCENARIO_ACTION_NAMES,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  isScenarioAction,
  TELEMETRY_CONDITION_STATES,
  drainedEnergyLevel,
  expectedEffectOf,
  isScenarioChannel,
  normalLoad,
  overloadedLoad,
  rechargedEnergyLevel,
  SILENCE_MARGIN_MS,
  repeatsCurrentState,
  scenarioActionDefinition,
  silenceCutoff,
} from './scenario-actions';
import { classifyEventCode } from '../faults/fault-alert-types';

describe('scenario actions (US31 · F-100)', () => {
  it('offers the six SCRUM-252 actions', () => {
    expect(SCENARIO_ACTION_NAMES.slice(0, 6)).toEqual([
      'OPEN_FUSE',
      'CLOSE_FUSE',
      'CUT_VOLTAGE',
      'RESTORE_VOLTAGE',
      'DROP_PHASE',
      'RESTORE_PHASE',
    ]);
  });

  it('gives every action a kind; the six SCRUM-252 actions are event actions with their fields (SCRUM-253)', () => {
    expect(SCENARIO_ACTION_KINDS).toEqual(['event', 'telemetry', 'silence']);
    expect(
      SCENARIO_ACTION_NAMES.slice(0, 6).map((action) => [
        action,
        scenarioActionDefinition(action),
      ]),
    ).toEqual([
      [
        'OPEN_FUSE',
        {
          kind: 'event',
          device: 'FALCON',
          event: '20',
          eventType: 'SET',
          channel: false,
        },
      ],
      [
        'CLOSE_FUSE',
        {
          kind: 'event',
          device: 'FALCON',
          event: '20',
          eventType: 'CLEAR',
          channel: false,
        },
      ],
      [
        'CUT_VOLTAGE',
        {
          kind: 'event',
          device: 'FALCON',
          event: '21',
          eventType: 'SET',
          channel: false,
        },
      ],
      [
        'RESTORE_VOLTAGE',
        {
          kind: 'event',
          device: 'FALCON',
          event: '21',
          eventType: 'CLEAR',
          channel: false,
        },
      ],
      [
        'DROP_PHASE',
        {
          kind: 'event',
          device: 'SMAC',
          event: '21',
          eventType: 'SET',
          channel: true,
        },
      ],
      [
        'RESTORE_PHASE',
        {
          kind: 'event',
          device: 'SMAC',
          event: '21',
          eventType: 'CLEAR',
          channel: true,
        },
      ],
    ]);
    for (const action of SCENARIO_ACTION_NAMES) {
      expect(scenarioActionDefinition(action)).toBe(SCENARIO_ACTIONS[action]);
    }
  });

  it('writes Technical Annex §4.2 codes that the fault list classifies as the right alert', () => {
    expect(eventCodeOf('OPEN_FUSE', '14', null)).toBe('131420');
    expect(eventCodeOf('CUT_VOLTAGE', '14', null)).toBe('131421');
    expect(eventCodeOf('DROP_PHASE', '15', 'C')).toBe('051521C');
    expect(classifyEventCode(eventCodeOf('CLOSE_FUSE', '14', null))).toBe(
      'FUSE_OPENING',
    );
    expect(classifyEventCode(eventCodeOf('RESTORE_VOLTAGE', '14', null))).toBe(
      'NO_VOLTAGE',
    );
    expect(classifyEventCode(eventCodeOf('RESTORE_PHASE', '14', 'A'))).toBe(
      'PHASE_LOSS',
    );
  });

  it('uses the alarm texts and values of Colbits devices', () => {
    expect(alarmTextOf('OPEN_FUSE', null)).toBe('Fusible abierto');
    expect(alarmTextOf('RESTORE_VOLTAGE', null)).toBe('Tensión normalizada');
    expect(alarmTextOf('DROP_PHASE', 'B')).toBe('Caída de la fase B');
    expect(alarmValueOf('OPEN_FUSE')).toBe('125°');
    expect(alarmValueOf('CUT_VOLTAGE')).toBeNull();
    expect(alarmValueOf('RESTORE_PHASE')).toBe('220');
  });

  it('refuses an action that repeats the current state', () => {
    expect(repeatsCurrentState('OPEN_FUSE', true)).toBe(true);
    expect(repeatsCurrentState('OPEN_FUSE', false)).toBe(false);
    expect(repeatsCurrentState('CLOSE_FUSE', false)).toBe(true);
    expect(repeatsCurrentState('RESTORE_PHASE', true)).toBe(false);
  });

  it('validates the action and the channel', () => {
    expect(isScenarioAction('DROP_PHASE')).toBe(true);
    expect(isScenarioAction('toString')).toBe(false);
    expect(isScenarioAction(7)).toBe(false);
    expect(isScenarioChannel('C')).toBe(true);
    expect(isScenarioChannel('D')).toBe(false);
  });
});

describe('scenario actions: telemetry conditions (SCRUM-253)', () => {
  it('lists every start right before its stop, after the six SCRUM-252 actions', () => {
    expect(SCENARIO_ACTION_NAMES.slice(6, 16)).toEqual([
      'DRAIN_SUPERCAPS',
      'RECHARGE_SUPERCAPS',
      'FREE_FALL',
      'END_FREE_FALL',
      'SOLAR_PANEL_ALARM',
      'CLEAR_SOLAR_PANEL_ALARM',
      'DRAIN_BATTERY',
      'RECHARGE_BATTERY',
      'START_OVERLOAD',
      'END_OVERLOAD',
    ]);
    const telemetry = SCENARIO_ACTION_NAMES.slice(6, 16);
    for (let i = 0; i < telemetry.length; i += 2) {
      const start = scenarioActionDefinition(telemetry[i]);
      const stop = scenarioActionDefinition(telemetry[i + 1]);
      expect(start).toMatchObject({ kind: 'telemetry', starts: true });
      expect(stop).toMatchObject({ kind: 'telemetry', starts: false });
      expect(stop).toMatchObject({
        device: start.device,
        condition: (start as { condition: string }).condition,
      });
    }
  });

  it('targets the device that owns the condition, never with a channel', () => {
    const targets = Object.fromEntries(
      SCENARIO_ACTION_NAMES.slice(6, 16).map((action) => {
        const { device, channel } = scenarioActionDefinition(action);
        expect(channel).toBe(false);
        return [action, device];
      }),
    );
    expect(targets).toEqual({
      DRAIN_SUPERCAPS: 'FALCON',
      RECHARGE_SUPERCAPS: 'FALCON',
      FREE_FALL: 'FALCON',
      END_FREE_FALL: 'FALCON',
      SOLAR_PANEL_ALARM: 'FALCON',
      CLEAR_SOLAR_PANEL_ALARM: 'FALCON',
      DRAIN_BATTERY: 'SMAC',
      RECHARGE_BATTERY: 'SMAC',
      START_OVERLOAD: 'SMAC',
      END_OVERLOAD: 'SMAC',
    });
  });

  it('only FREE_FALL sends an event: a 13xx01 MSG with the Colbits text, classified as FREE_FALL', () => {
    expect(scenarioActionDefinition('FREE_FALL')).toMatchObject({
      event: '01',
      eventType: 'MSG',
    });
    expect(eventCodeOf('FREE_FALL', '14', null)).toBe('131401');
    expect(classifyEventCode(eventCodeOf('FREE_FALL', '15', null))).toBe(
      'FREE_FALL',
    );
    expect(alarmTextOf('FREE_FALL', null)).toBe('Movimiento anormal detectado');
    expect(alarmValueOf('FREE_FALL')).toBeNull();
    for (const action of SCENARIO_ACTION_NAMES.slice(6)) {
      if (action === 'FREE_FALL') continue;
      expect(() => eventCodeOf(action, '14', null)).toThrow(/no alarm event/);
      expect(() => alarmTextOf(action, null)).toThrow(/no alarm event/);
    }
  });

  it('a start is refused while its condition is on, a stop while it is off', () => {
    expect(repeatsCurrentState('DRAIN_BATTERY', true)).toBe(true);
    expect(repeatsCurrentState('DRAIN_BATTERY', false)).toBe(false);
    expect(repeatsCurrentState('RECHARGE_BATTERY', false)).toBe(true);
    expect(repeatsCurrentState('RECHARGE_BATTERY', true)).toBe(false);
    expect(repeatsCurrentState('END_FREE_FALL', false)).toBe(true);
  });

  it('describes each new action and names each condition for its 409', () => {
    for (const action of SCENARIO_ACTION_NAMES.slice(6)) {
      expect(expectedEffectOf(action).length).toBeGreaterThan(30);
    }
    expect(Object.keys(TELEMETRY_CONDITION_STATES).sort()).toEqual([
      'FALCON_LOW_ENERGY',
      'FREE_FALL',
      'OVERLOAD',
      'SMAC_LOW_ENERGY',
      'SOLAR_PANEL',
    ]);
  });

  it('derives the written values from the thresholds', () => {
    for (const threshold of [0.5, 5, 20, 30, 45.5, 99, 100]) {
      const drained = drainedEnergyLevel(threshold);
      const recharged = rechargedEnergyLevel(threshold);
      expect(Number.isInteger(drained) && Number.isInteger(recharged)).toBe(
        true,
      );
      expect(drained).toBeGreaterThanOrEqual(0);
      expect(drained).toBeLessThan(threshold);
      expect(recharged).toBeGreaterThanOrEqual(threshold);
      expect(recharged).toBeLessThanOrEqual(100);
    }
    expect(drainedEnergyLevel(30)).toBe(10);
    expect(rechargedEnergyLevel(30)).toBe(80);
    expect(overloadedLoad(90)).toBe(115);
    expect(overloadedLoad(80)).toBe(105);
    expect(normalLoad(90)).toBe(60);
    expect(normalLoad(10)).toBe(0);
  });
});

describe('scenario actions: inactivity (SCRUM-253)', () => {
  it('ends the list with SILENCE / RESUME pairs, Falcon then SMAC, without a channel', () => {
    expect(SCENARIO_ACTION_NAMES.slice(16)).toEqual([
      'SILENCE_FALCON',
      'RESUME_FALCON',
      'SILENCE_SMAC',
      'RESUME_SMAC',
    ]);
    expect(
      SCENARIO_ACTION_NAMES.slice(16).map(scenarioActionDefinition),
    ).toEqual([
      { kind: 'silence', device: 'FALCON', channel: false, starts: true },
      { kind: 'silence', device: 'FALCON', channel: false, starts: false },
      { kind: 'silence', device: 'SMAC', channel: false, starts: true },
      { kind: 'silence', device: 'SMAC', channel: false, starts: false },
    ]);
  });

  it('sends no event, describes the effect and refuses a repeat', () => {
    for (const action of SCENARIO_ACTION_NAMES.slice(16)) {
      expect(() => eventCodeOf(action, '14', null)).toThrow(/no alarm event/);
      expect(expectedEffectOf(action)).toMatch(/inactiv/);
    }
    expect(repeatsCurrentState('SILENCE_FALCON', true)).toBe(true);
    expect(repeatsCurrentState('SILENCE_FALCON', false)).toBe(false);
    expect(repeatsCurrentState('RESUME_SMAC', false)).toBe(true);
    expect(repeatsCurrentState('RESUME_SMAC', true)).toBe(false);
  });

  it('cuts at the database clock minus the threshold minus one minute', () => {
    const now = new Date('2026-11-16T12:00:00.000Z');
    expect(SILENCE_MARGIN_MS).toBe(60_000);
    expect(silenceCutoff(now, 9).toISOString()).toBe(
      '2026-11-16T02:59:00.000Z',
    );
    expect(silenceCutoff(now, 3).toISOString()).toBe(
      '2026-11-16T08:59:00.000Z',
    );
    expect(silenceCutoff(now, 1.5).toISOString()).toBe(
      '2026-11-16T10:29:00.000Z',
    );
  });
});
