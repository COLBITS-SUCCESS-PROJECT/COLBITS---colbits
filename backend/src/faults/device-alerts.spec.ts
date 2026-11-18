import type { DeviceAlertThresholds } from './device-alert-thresholds';
import {
  DEVICE_ALERT_TYPES,
  deviceAlertId,
  evaluateFreeFallEpisode,
  evaluateOverloadEpisode,
  evaluateSolarPanelEpisode,
  type FlagReading,
  type FreeFallEvent,
  isFreeFallActivation,
  OVERLOAD_CONDITIONS,
  toMeasurement,
  type TransformerReading,
} from './device-alerts';
import { ALERT_TYPES } from './fault-alert-types';

/** An instant, in minutes after 2026-11-14 10:00 UTC. */
const at = (minutes: number): Date =>
  new Date(Date.UTC(2026, 10, 14, 10, minutes));

/** CL-05, TD-09 and TD-10: 90 %, 2 % and no current-imbalance threshold. */
const DEFAULTS: DeviceAlertThresholds = {
  overloadPercent: 90,
  voltageUnbalancePercent: 2,
  currentUnbalancePercent: null,
};

const reading = (
  minutes: number,
  loadPercent: number | null,
  voltageUnbalancePercent: number | null = null,
  currentUnbalancePercent: number | null = null,
): TransformerReading => ({
  recordedAt: at(minutes),
  loadPercent,
  voltageUnbalancePercent,
  currentUnbalancePercent,
});

const SOURCE = '0000100004-T1-3';
const idOf = (startedAt: Date | null): string =>
  deviceAlertId('OVERLOAD_UNBALANCE', SOURCE, startedAt as Date);

describe('device alert types', () => {
  it('are alert types of the F-47 registry, so no other type can appear', () => {
    for (const type of DEVICE_ALERT_TYPES) {
      expect(ALERT_TYPES).toContain(type);
    }
    expect([...DEVICE_ALERT_TYPES]).toEqual([
      'FREE_FALL',
      'SOLAR_PANEL_FAILURE',
      'OVERLOAD_UNBALANCE',
    ]);
  });
});

describe('deviceAlertId', () => {
  it('is <type>:<source>:<started_at>', () => {
    expect(deviceAlertId('FREE_FALL', '0000200001-T', at(5))).toBe(
      'FREE_FALL:0000200001-T:2026-11-14T10:05:00.000Z',
    );
  });

  it('is the same for the same start, and differs by type, source and start', () => {
    const base = deviceAlertId('SOLAR_PANEL_FAILURE', 'F-1', at(0));
    expect(deviceAlertId('SOLAR_PANEL_FAILURE', 'F-1', at(0))).toBe(base);
    expect(deviceAlertId('FREE_FALL', 'F-1', at(0))).not.toBe(base);
    expect(deviceAlertId('SOLAR_PANEL_FAILURE', 'F-2', at(0))).not.toBe(base);
    expect(deviceAlertId('SOLAR_PANEL_FAILURE', 'F-1', at(1))).not.toBe(base);
  });

  it('never looks like a fuse-opening id (a number first)', () => {
    for (const type of DEVICE_ALERT_TYPES) {
      expect(deviceAlertId(type, 'X', at(0))).toMatch(/^[A-Z_]+:/);
    }
  });
});

describe('toMeasurement', () => {
  it.each([
    [12.5, 12.5],
    ['12.5', 12.5],
    [' 7 ', 7],
    [0, 0],
    ['0', 0],
  ])('reads %p as %p', (value, expected) => {
    expect(toMeasurement(value)).toBe(expected);
  });

  it.each([null, undefined, '', '  ', 'abc', NaN, Infinity])(
    'reads %p as no measurement',
    (value) => {
      expect(toMeasurement(value)).toBeNull();
    },
  );
});

describe('evaluateOverloadEpisode (F-47, NF-22, TD-08)', () => {
  it('is inactive with no readings', () => {
    expect(evaluateOverloadEpisode([], DEFAULTS)).toEqual({
      active: false,
      startedAt: null,
      conditions: [],
      lastValues: {
        loadPercent: null,
        voltageUnbalancePercent: null,
        currentUnbalancePercent: null,
      },
    });
  });

  describe('thresholds are strict: only a value above raises a condition', () => {
    it.each([
      [89.99, false],
      [90, false],
      [90.01, true],
      [118, true],
    ])('load_percent %p → active %p (threshold 90)', (load, active) => {
      const episode = evaluateOverloadEpisode([reading(0, load)], DEFAULTS);
      expect(episode.active).toBe(active);
      expect(episode.conditions).toEqual(active ? ['OVERLOAD'] : []);
    });

    it.each([
      [1.99, false],
      [2, false],
      [2.01, true],
    ])('vuf_percent %p → active %p (threshold 2)', (vuf, active) => {
      const episode = evaluateOverloadEpisode([reading(0, 50, vuf)], DEFAULTS);
      expect(episode.active).toBe(active);
      expect(episode.conditions).toEqual(active ? ['VOLTAGE_UNBALANCE'] : []);
    });

    it('cuf_percent: same rule once a threshold is set', () => {
      const enabled = { ...DEFAULTS, currentUnbalancePercent: 10 };
      expect(
        evaluateOverloadEpisode([reading(0, 50, 1, 10)], enabled).active,
      ).toBe(false);
      expect(
        evaluateOverloadEpisode([reading(0, 50, 1, 10.01)], enabled),
      ).toMatchObject({ active: true, conditions: ['CURRENT_UNBALANCE'] });
    });

    it('a value stored as text (numeric columns) compares as a number', () => {
      const episode = evaluateOverloadEpisode(
        [
          {
            recordedAt: at(0),
            loadPercent: '95.5' as unknown as number,
            voltageUnbalancePercent: null,
            currentUnbalancePercent: null,
          },
        ],
        DEFAULTS,
      );
      expect(episode).toMatchObject({
        active: true,
        lastValues: { loadPercent: 95.5 },
      });
    });
  });

  describe('NF-22: the thresholds change the result with no code change', () => {
    it('a transformer at 85 % is normal at 90 and in overload at 80', () => {
      const readings = [reading(0, 85)];
      expect(evaluateOverloadEpisode(readings, DEFAULTS).active).toBe(false);
      expect(
        evaluateOverloadEpisode(readings, {
          ...DEFAULTS,
          overloadPercent: 80,
        }),
      ).toMatchObject({ active: true, conditions: ['OVERLOAD'] });
    });

    it('the voltage-imbalance threshold works the same way', () => {
      const readings = [reading(0, 50, 2.5)];
      expect(evaluateOverloadEpisode(readings, DEFAULTS).active).toBe(true);
      expect(
        evaluateOverloadEpisode(readings, {
          ...DEFAULTS,
          voltageUnbalancePercent: 3,
        }).active,
      ).toBe(false);
    });

    it('the current-imbalance threshold works the same way', () => {
      const readings = [reading(0, 50, 1, 6)];
      expect(
        evaluateOverloadEpisode(readings, {
          ...DEFAULTS,
          currentUnbalancePercent: 5,
        }).active,
      ).toBe(true);
      expect(
        evaluateOverloadEpisode(readings, {
          ...DEFAULTS,
          currentUnbalancePercent: 8,
        }).active,
      ).toBe(false);
    });
  });

  describe('TD-10: current imbalance disabled (no threshold)', () => {
    it('never raises an alert, however high cuf_percent is', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 50, 1, 99), reading(5, 50, 1, 500)],
        DEFAULTS,
      );

      expect(episode.active).toBe(false);
      expect(episode.startedAt).toBeNull();
      expect(episode.conditions).toEqual([]);
    });

    it('never lists CURRENT_UNBALANCE, but overload and voltage imbalance still work', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 3, 99)],
        DEFAULTS,
      );

      expect(episode.conditions).toEqual(['OVERLOAD', 'VOLTAGE_UNBALANCE']);
    });

    it('still reports the last cuf_percent as information', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 1, 7.5)],
        DEFAULTS,
      );

      expect(episode.lastValues.currentUnbalancePercent).toBe(7.5);
    });

    it('enabling it later re-evaluates the history (documented: the start can move earlier)', () => {
      const readings = [reading(0, 50, 1, 20), reading(10, 95, 1, 20)];

      const before = evaluateOverloadEpisode(readings, DEFAULTS);
      const after = evaluateOverloadEpisode(readings, {
        ...DEFAULTS,
        currentUnbalancePercent: 10,
      });

      expect(before.startedAt).toEqual(at(10));
      expect(after.startedAt).toEqual(at(0));
    });
  });

  describe('one combined alert per transformer: the union of the conditions', () => {
    const enabled: DeviceAlertThresholds = {
      ...DEFAULTS,
      currentUnbalancePercent: 10,
    };

    it('lists the active conditions in a fixed order', () => {
      const episode = evaluateOverloadEpisode([reading(0, 95, 3, 12)], enabled);
      expect(episode.conditions).toEqual([...OVERLOAD_CONDITIONS]);
    });

    it('stays one episode, with the same start and id, while overlapping conditions come and go', () => {
      const readings = [
        reading(0, 95, 1), //   overload
        reading(15, 95, 3), //  overload + voltage imbalance
        reading(30, 80, 3), //  overload resolved, voltage imbalance holds
        reading(45, 80, 1), //  voltage imbalance resolved: back to normal
        reading(60, 80, 3), //  voltage imbalance again: a NEW episode
      ];

      const states = readings.map((_, i) =>
        evaluateOverloadEpisode(readings.slice(0, i + 1), DEFAULTS),
      );

      expect(states[0]).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['OVERLOAD'],
      });
      expect(states[1]).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE'],
      });
      expect(states[2]).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['VOLTAGE_UNBALANCE'],
      });
      expect(states[3]).toMatchObject({
        active: false,
        startedAt: null,
        conditions: [],
      });
      expect(states[4]).toMatchObject({
        active: true,
        startedAt: at(60),
        conditions: ['VOLTAGE_UNBALANCE'],
      });

      // The id is the same at every step of the first episode and new for the second.
      const firstEpisodeIds = states.slice(0, 3).map((s) => idOf(s.startedAt));
      expect(new Set(firstEpisodeIds).size).toBe(1);
      expect(idOf(states[4].startedAt)).not.toBe(firstEpisodeIds[0]);
    });

    it('a condition that starts while another holds does not move the start', () => {
      const episode = evaluateOverloadEpisode(
        [
          reading(0, 95),
          reading(10, 96),
          reading(20, 97, 4),
          reading(30, 97, 4, 15),
        ],
        enabled,
      );

      expect(episode.startedAt).toEqual(at(0));
      expect(episode.conditions).toEqual([...OVERLOAD_CONDITIONS]);
    });

    it('hands over from one condition to the next with no gap and no restart', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 1), reading(10, 85, 3)],
        DEFAULTS,
      );

      expect(episode).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['VOLTAGE_UNBALANCE'],
      });
    });

    it('a repeated reading in the same state keeps the same id', () => {
      const a = evaluateOverloadEpisode([reading(0, 95)], DEFAULTS);
      const b = evaluateOverloadEpisode(
        [reading(0, 95), reading(5, 96), reading(10, 94)],
        DEFAULTS,
      );

      expect(idOf(b.startedAt)).toBe(idOf(a.startedAt));
    });

    it('ends only when EVERY condition is back at or below its threshold', () => {
      const readings = [
        reading(0, 95, 3),
        reading(10, 90, 3),
        reading(20, 90, 2),
      ];

      expect(
        evaluateOverloadEpisode(readings.slice(0, 2), DEFAULTS).conditions,
      ).toEqual(['VOLTAGE_UNBALANCE']);
      expect(evaluateOverloadEpisode(readings, DEFAULTS)).toMatchObject({
        active: false,
        startedAt: null,
      });
    });

    it('sorts the readings by time, whatever order they arrive in', () => {
      const ordered = [reading(0, 80), reading(10, 95), reading(20, 96)];
      const shuffled = [ordered[2], ordered[0], ordered[1]];

      expect(evaluateOverloadEpisode(shuffled, DEFAULTS)).toEqual(
        evaluateOverloadEpisode(ordered, DEFAULTS),
      );
      expect(evaluateOverloadEpisode(shuffled, DEFAULTS).startedAt).toEqual(
        at(10),
      );
    });
  });

  describe('NULL telemetry: a missing value is never proof of recovery', () => {
    it('a reading with the measurement missing does not resolve an active condition', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 1), reading(10, null, 1)],
        DEFAULTS,
      );

      expect(episode).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['OVERLOAD'],
      });
    });

    it('only a later value at or below the threshold resolves it', () => {
      const base = [reading(0, 95, 1), reading(10, null, 1), reading(20, null)];
      expect(evaluateOverloadEpisode(base, DEFAULTS).active).toBe(true);

      expect(
        evaluateOverloadEpisode([...base, reading(30, 91)], DEFAULTS).active,
      ).toBe(true);
      expect(
        evaluateOverloadEpisode([...base, reading(30, 90)], DEFAULTS),
      ).toMatchObject({ active: false, startedAt: null });
    });

    it('a NULL in one measurement does not hide another measurement that is above its threshold', () => {
      const episode = evaluateOverloadEpisode([reading(0, null, 3)], DEFAULTS);

      expect(episode).toMatchObject({
        active: true,
        startedAt: at(0),
        conditions: ['VOLTAGE_UNBALANCE'],
      });
    });

    it('a NULL in one measurement does not turn another condition off either', () => {
      // Overload is still active while a later reading only reports voltage imbalance as normal.
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 1), reading(10, null, 1.5)],
        DEFAULTS,
      );

      expect(episode.conditions).toEqual(['OVERLOAD']);
      expect(episode.startedAt).toEqual(at(0));
    });

    it('a transformer with only NULL values so far has no evidence, so it is not alerted', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, null), reading(10, null, null, null)],
        DEFAULTS,
      );

      expect(episode).toMatchObject({
        active: false,
        startedAt: null,
        conditions: [],
      });
    });

    it('an all-NULL reading changes nothing: it keeps an active episode and its id', () => {
      const before = evaluateOverloadEpisode([reading(0, 95)], DEFAULTS);
      const after = evaluateOverloadEpisode(
        [reading(0, 95), reading(10, null), reading(20, null, null, null)],
        DEFAULTS,
      );

      expect(after.active).toBe(true);
      expect(after.startedAt).toEqual(at(0));
      expect(idOf(after.startedAt)).toBe(idOf(before.startedAt));
    });

    it('an all-NULL reading does not start an episode and does not end a resolved one', () => {
      const resolved = evaluateOverloadEpisode(
        [reading(0, 95), reading(10, 80), reading(20, null)],
        DEFAULTS,
      );

      expect(resolved).toMatchObject({ active: false, startedAt: null });
    });

    it('an all-NULL reading in the middle of an episode does not split it', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95), reading(10, null), reading(20, 96)],
        DEFAULTS,
      );

      expect(episode.startedAt).toEqual(at(0));
    });

    it('treats a value that is not a finite number as missing', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95), reading(10, NaN, Infinity)],
        DEFAULTS,
      );

      expect(episode).toMatchObject({ active: true, startedAt: at(0) });
    });

    it('lastValues keeps the last reported value of each measurement across NULL readings', () => {
      const episode = evaluateOverloadEpisode(
        [reading(0, 95, 3, 4), reading(10, null, 1.2, null), reading(20, null)],
        DEFAULTS,
      );

      expect(episode.lastValues).toEqual({
        loadPercent: 95,
        voltageUnbalancePercent: 1.2,
        currentUnbalancePercent: 4,
      });
    });
  });
});

describe('isFreeFallActivation (TD-02, CL-14)', () => {
  it.each(['SET', 'set', 'Set', 'MSG', 'msg', 'Msg'])(
    'a 13xx01 event of type %p raises free fall',
    (eventType) => {
      expect(isFreeFallActivation('131401', eventType)).toBe(true);
    },
  );

  it.each(['CLEAR', 'clear', 'Clear', '', ' SET', 'SET ', 'SETS', 'ſet'])(
    'a 13xx01 event of type %p does not (CLEAR is undocumented for free fall)',
    (eventType) => {
      expect(isFreeFallActivation('131401', eventType)).toBe(false);
    },
  );

  it('ignores the firmware version in the code, as the registry does', () => {
    expect(isFreeFallActivation('130101', 'MSG')).toBe(true);
    expect(isFreeFallActivation('139901', 'MSG')).toBe(true);
  });

  it.each(['131420', '131421', '051401', '13140', '1314011', ' 131401', ''])(
    'any other event code is not free fall (%p)',
    (code) => {
      expect(isFreeFallActivation(code, 'SET')).toBe(false);
    },
  );
});

describe('evaluateFreeFallEpisode (TD-02, CL-14, CL-01)', () => {
  const event = (minutes: number, eventType = 'MSG'): FreeFallEvent => ({
    eventCode: '131401',
    eventType,
    recordedAt: at(minutes),
  });
  const flag = (minutes: number, value: boolean | null): FlagReading => ({
    recordedAt: at(minutes),
    flag: value,
  });

  it('is inactive with no event, even when the flag is true (alarms take priority, CL-01)', () => {
    expect(
      evaluateFreeFallEpisode([], [flag(0, true), flag(10, true)]),
    ).toEqual({ active: false, startedAt: null });
  });

  it('is active from the event, and stays so when no reading follows', () => {
    expect(evaluateFreeFallEpisode([event(5)], [])).toEqual({
      active: true,
      startedAt: at(5),
    });
  });

  it.each(['SET', 'set', 'MSG', 'msg'])('a %p event raises it', (eventType) => {
    expect(evaluateFreeFallEpisode([event(5, eventType)], []).active).toBe(
      true,
    );
  });

  it('stays active while the readings keep the flag true', () => {
    expect(
      evaluateFreeFallEpisode(
        [event(5)],
        [flag(6, true), flag(12, true), flag(18, true)],
      ),
    ).toEqual({ active: true, startedAt: at(5) });
  });

  it('is resolved by the first later reading with the flag false', () => {
    expect(
      evaluateFreeFallEpisode([event(5)], [flag(6, true), flag(12, false)]),
    ).toEqual({ active: false, startedAt: null });
  });

  it('a later NULL flag is no evidence of recovery', () => {
    expect(
      evaluateFreeFallEpisode([event(5)], [flag(6, true), flag(12, null)]),
    ).toEqual({ active: true, startedAt: at(5) });
    // ...and only a later explicit false ends it.
    expect(
      evaluateFreeFallEpisode([event(5)], [flag(12, null), flag(18, false)])
        .active,
    ).toBe(false);
  });

  it('a false flag at the same instant as the event does not resolve it', () => {
    expect(evaluateFreeFallEpisode([event(5)], [flag(5, false)])).toEqual({
      active: true,
      startedAt: at(5),
    });
  });

  it('a false flag before the event has no effect on it', () => {
    expect(
      evaluateFreeFallEpisode([event(5)], [flag(0, false), flag(4, false)]),
    ).toEqual({ active: true, startedAt: at(5) });
  });

  describe('repeated events', () => {
    it('keep the start and id of the first while it is active', () => {
      const first = evaluateFreeFallEpisode([event(5)], []);
      const repeated = evaluateFreeFallEpisode(
        [event(5), event(8, 'SET'), event(11), event(14, 'msg')],
        [flag(6, true), flag(12, true)],
      );

      expect(repeated).toEqual({ active: true, startedAt: at(5) });
      expect(deviceAlertId('FREE_FALL', 'F', repeated.startedAt as Date)).toBe(
        deviceAlertId('FREE_FALL', 'F', first.startedAt as Date),
      );
    });

    it('an event after the resolution starts a new episode with its own start', () => {
      const episode = evaluateFreeFallEpisode(
        [event(5), event(30)],
        [flag(6, true), flag(12, false)],
      );

      expect(episode).toEqual({ active: true, startedAt: at(30) });
    });

    it('a repeated event after the resolution resolved earlier is a new episode, not a restart of the old one', () => {
      const resolved = evaluateFreeFallEpisode([event(5)], [flag(12, false)]);
      const again = evaluateFreeFallEpisode(
        [event(5), event(30)],
        [flag(12, false)],
      );

      expect(resolved.active).toBe(false);
      expect(again.startedAt).toEqual(at(30));
    });

    it('an event at the same instant as a later false reading starts a new episode (the event is the last word)', () => {
      const episode = evaluateFreeFallEpisode(
        [event(5), event(12)],
        [flag(12, false)],
      );

      expect(episode).toEqual({ active: true, startedAt: at(12) });
    });
  });

  describe('events that are not documented activations', () => {
    it('a CLEAR alone raises nothing', () => {
      expect(
        evaluateFreeFallEpisode([event(5, 'CLEAR')], [flag(6, true)]),
      ).toEqual({ active: false, startedAt: null });
    });

    it('a CLEAR does not resolve an active free fall: only telemetry does', () => {
      expect(
        evaluateFreeFallEpisode(
          [event(5, 'SET'), event(10, 'CLEAR'), event(10, 'clear')],
          [flag(6, true)],
        ),
      ).toEqual({ active: true, startedAt: at(5) });
    });

    it('an event with another code is ignored', () => {
      expect(
        evaluateFreeFallEpisode(
          [{ eventCode: '131420', eventType: 'SET', recordedAt: at(5) }],
          [],
        ).active,
      ).toBe(false);
    });
  });

  it('sorts events and readings by time, whatever order they arrive in', () => {
    const episode = evaluateFreeFallEpisode(
      [event(30), event(5)],
      [flag(12, false), flag(6, true)],
    );

    expect(episode).toEqual({ active: true, startedAt: at(30) });
  });
});

describe('evaluateSolarPanelEpisode (CL-10)', () => {
  const flag = (minutes: number, value: boolean | null): FlagReading => ({
    recordedAt: at(minutes),
    flag: value,
  });

  it('is inactive with no readings, or while the flag is false', () => {
    expect(evaluateSolarPanelEpisode([])).toEqual({
      active: false,
      startedAt: null,
    });
    expect(
      evaluateSolarPanelEpisode([flag(0, false), flag(10, false)]).active,
    ).toBe(false);
  });

  it('starts at the first reading with the flag true, and keeps that start while it stays true', () => {
    expect(
      evaluateSolarPanelEpisode([
        flag(0, false),
        flag(10, true),
        flag(20, true),
        flag(30, true),
      ]),
    ).toEqual({ active: true, startedAt: at(10) });
  });

  it('is resolved by a later false reading and a new true one starts a new episode', () => {
    expect(
      evaluateSolarPanelEpisode([flag(0, true), flag(10, false)]).active,
    ).toBe(false);
    expect(
      evaluateSolarPanelEpisode([
        flag(0, true),
        flag(10, false),
        flag(20, true),
      ]),
    ).toEqual({ active: true, startedAt: at(20) });
  });

  it('a NULL flag is no evidence of recovery: it does not end the episode or split it', () => {
    expect(
      evaluateSolarPanelEpisode([
        flag(0, true),
        flag(10, null),
        flag(20, null),
      ]),
    ).toEqual({ active: true, startedAt: at(0) });
    expect(
      evaluateSolarPanelEpisode([flag(0, true), flag(10, null), flag(20, true)])
        .startedAt,
    ).toEqual(at(0));
  });

  it('a NULL flag does not raise it either', () => {
    expect(evaluateSolarPanelEpisode([flag(0, null), flag(10, null)])).toEqual({
      active: false,
      startedAt: null,
    });
    expect(
      evaluateSolarPanelEpisode([flag(0, false), flag(10, null)]).active,
    ).toBe(false);
  });

  it('only an explicit false after NULL readings resolves it', () => {
    expect(
      evaluateSolarPanelEpisode([
        flag(0, true),
        flag(10, null),
        flag(20, false),
      ]),
    ).toEqual({ active: false, startedAt: null });
  });

  it('sorts the readings by time', () => {
    expect(
      evaluateSolarPanelEpisode([
        flag(20, true),
        flag(0, false),
        flag(10, true),
      ]),
    ).toEqual({ active: true, startedAt: at(10) });
  });
});
