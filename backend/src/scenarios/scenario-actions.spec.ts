import {
  SCENARIO_ACTIONS,
  SCENARIO_ACTION_KINDS,
  SCENARIO_ACTION_NAMES,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  OUT_OF_RANGE_PHASE_VOLTS,
  NOMINAL_PHASE_VOLTS,
  phaseVoltsOf,
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

describe('scenario actions: phase out of range (05xx20y)', () => {
  it('lists the pair right after RESTORE_PHASE, 22 actions in all, each start before its stop', () => {
    expect(SCENARIO_ACTION_NAMES).toHaveLength(22);
    expect(SCENARIO_ACTION_NAMES.slice(4, 8)).toEqual([
      'DROP_PHASE',
      'RESTORE_PHASE',
      'PHASE_OUT_OF_RANGE',
      'PHASE_IN_RANGE',
    ]);
  });

  it('are SMAC event actions on the 20 event with a channel', () => {
    expect(scenarioActionDefinition('PHASE_OUT_OF_RANGE')).toEqual({
      kind: 'event',
      device: 'SMAC',
      event: '20',
      eventType: 'SET',
      channel: true,
    });
    expect(scenarioActionDefinition('PHASE_IN_RANGE')).toEqual({
      kind: 'event',
      device: 'SMAC',
      event: '20',
      eventType: 'CLEAR',
      channel: true,
    });
  });

  it('write 05xx20y codes with the device firmware that the fault list classifies as PHASE_OUT_OF_RANGE', () => {
    expect(eventCodeOf('PHASE_OUT_OF_RANGE', '14', 'A')).toBe('051420A');
    expect(eventCodeOf('PHASE_OUT_OF_RANGE', '15', 'B')).toBe('051520B');
    expect(eventCodeOf('PHASE_IN_RANGE', '14', 'C')).toBe('051420C');
    for (const action of ['PHASE_OUT_OF_RANGE', 'PHASE_IN_RANGE'] as const) {
      for (const channel of ['A', 'B', 'C'] as const) {
        expect(classifyEventCode(eventCodeOf(action, '14', channel))).toBe(
          'PHASE_OUT_OF_RANGE',
        );
      }
    }
  });

  it('use the seed wording and values: 198.4 V out of range, 220 V back in range', () => {
    expect(alarmTextOf('PHASE_OUT_OF_RANGE', 'A')).toBe(
      'Fase A fuera de rango',
    );
    expect(alarmTextOf('PHASE_IN_RANGE', 'C')).toBe('Fase C dentro de rango');
    expect(OUT_OF_RANGE_PHASE_VOLTS).toBe(198.4);
    expect(alarmValueOf('PHASE_OUT_OF_RANGE')).toBe('198.4');
    expect(alarmValueOf('PHASE_IN_RANGE')).toBe('220');
    expect(phaseVoltsOf('PHASE_OUT_OF_RANGE')).toBe(OUT_OF_RANGE_PHASE_VOLTS);
    expect(phaseVoltsOf('PHASE_IN_RANGE')).toBe(NOMINAL_PHASE_VOLTS);
    expect(phaseVoltsOf('DROP_PHASE')).toBe(0);
    expect(phaseVoltsOf('RESTORE_PHASE')).toBe(NOMINAL_PHASE_VOLTS);
  });

  it('require a channel, refuse a repeat and describe the effect without a map change', () => {
    expect(SCENARIO_ACTIONS.PHASE_OUT_OF_RANGE.channel).toBe(true);
    expect(SCENARIO_ACTIONS.PHASE_IN_RANGE.channel).toBe(true);
    expect(repeatsCurrentState('PHASE_OUT_OF_RANGE', true)).toBe(true);
    expect(repeatsCurrentState('PHASE_OUT_OF_RANGE', false)).toBe(false);
    expect(repeatsCurrentState('PHASE_IN_RANGE', false)).toBe(true);
    expect(repeatsCurrentState('PHASE_IN_RANGE', true)).toBe(false);
    expect(expectedEffectOf('PHASE_OUT_OF_RANGE')).toMatch(
      /phaseOutOfRangeNodes.*map state does not change/,
    );
    expect(expectedEffectOf('PHASE_IN_RANGE')).toMatch(
      /GET \/faults\/resolved/,
    );
  });
});

describe('scenario actions: telemetry conditions (SCRUM-253)', () => {
  it('lists every start right before its stop, after the SCRUM-252 actions and the phase out of range pair', () => {
    expect(SCENARIO_ACTION_NAMES.slice(8, 18)).toEqual([
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
    const telemetry = SCENARIO_ACTION_NAMES.slice(8, 18);
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
      SCENARIO_ACTION_NAMES.slice(8, 18).map((action) => {
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
    for (const action of SCENARIO_ACTION_NAMES.slice(8)) {
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
    for (const action of SCENARIO_ACTION_NAMES.slice(8)) {
      expect(expectedEffectOf(action).length).toBeGreaterThan(30);
    }
    expect(
      Object.keys(TELEMETRY_CONDITION_STATES).sort((a, b) =>
        a.localeCompare(b),
      ),
    ).toEqual([
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
    expect(SCENARIO_ACTION_NAMES.slice(18)).toEqual([
      'SILENCE_FALCON',
      'RESUME_FALCON',
      'SILENCE_SMAC',
      'RESUME_SMAC',
    ]);
    expect(
      SCENARIO_ACTION_NAMES.slice(18).map(scenarioActionDefinition),
    ).toEqual([
      { kind: 'silence', device: 'FALCON', channel: false, starts: true },
      { kind: 'silence', device: 'FALCON', channel: false, starts: false },
      { kind: 'silence', device: 'SMAC', channel: false, starts: true },
      { kind: 'silence', device: 'SMAC', channel: false, starts: false },
    ]);
  });

  it('sends no event, describes the effect and refuses a repeat', () => {
    for (const action of SCENARIO_ACTION_NAMES.slice(18)) {
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
