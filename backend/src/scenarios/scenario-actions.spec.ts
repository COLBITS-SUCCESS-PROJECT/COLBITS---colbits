import {
  SCENARIO_ACTIONS,
  SCENARIO_ACTION_KINDS,
  SCENARIO_ACTION_NAMES,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  isScenarioAction,
  isScenarioChannel,
  repeatsCurrentState,
  scenarioActionDefinition,
} from './scenario-actions';
import { classifyEventCode } from '../faults/fault-alert-types';

describe('scenario actions (US31 · F-100)', () => {
  it('offers the six SCRUM-252 actions', () => {
    expect(SCENARIO_ACTION_NAMES).toEqual([
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
      SCENARIO_ACTION_NAMES.map((action) => [
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
