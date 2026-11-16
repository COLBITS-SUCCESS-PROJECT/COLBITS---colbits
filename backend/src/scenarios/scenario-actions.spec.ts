import {
  SCENARIO_ACTION_NAMES,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  isScenarioAction,
  isScenarioChannel,
  repeatsCurrentState,
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
