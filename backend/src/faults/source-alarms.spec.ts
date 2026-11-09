import { ALERT_TYPE_DEFINITIONS, ALERT_TYPES } from './fault-alert-types';
import {
  SMAC_CHANNELS,
  SOURCE_ALARM_TYPES,
  SourceAlarmRow,
  channelOf,
  deviceOf,
  openDurationSeconds,
  sourceAlarmId,
  sourceAlarmTypeOf,
  toSourceAlarmDto,
} from './source-alarms';

const NOW = new Date('2026-10-29T15:20:00.000Z');
const STARTED = '2026-10-29T15:05:00.000Z';

const voltageRow = (
  overrides: Partial<SourceAlarmRow> = {},
): SourceAlarmRow => ({
  event_code: '131421',
  started_at: new Date(STARTED),
  source_id: '0000100002-A-R',
  node_id: '0000100002',
  circuit_id: 1,
  circuit_name: 'CTO 1',
  fuses_set_id: 2,
  branch: 'A',
  phase: 'R',
  ...overrides,
});

const smacRow = (overrides: Partial<SourceAlarmRow> = {}): SourceAlarmRow => ({
  event_code: '051421A',
  started_at: new Date(STARTED),
  source_id: '0000100004-T1-3',
  node_id: '0000100004',
  circuit_id: '3',
  circuit_name: 'CTO 3',
  fuses_set_id: null,
  branch: null,
  phase: null,
  ...overrides,
});

function faultOf(row: SourceAlarmRow, now = NOW) {
  const result = toSourceAlarmDto(row, now);
  if (!('fault' in result)) {
    throw new Error(`expected an entry, got ${JSON.stringify(result)}`);
  }
  return result.fault;
}

describe('source alarm types (SCRUM-225 · F-47)', () => {
  it('are registry types with a documented event code', () => {
    for (const type of SOURCE_ALARM_TYPES) {
      expect(ALERT_TYPES).toContain(type);
      expect(ALERT_TYPE_DEFINITIONS[type].eventCodePattern).not.toBeNull();
    }
  });

  it('map Annex §4.2 codes: 13xx21, 05xx21y and 05xx20y', () => {
    expect(sourceAlarmTypeOf('131421')).toBe('NO_VOLTAGE');
    expect(sourceAlarmTypeOf('051421A')).toBe('PHASE_LOSS');
    expect(sourceAlarmTypeOf('0514211')).toBe('PHASE_LOSS');
    expect(sourceAlarmTypeOf('051420B')).toBe('PHASE_OUT_OF_RANGE');
    expect(sourceAlarmTypeOf('0514202')).toBe('PHASE_OUT_OF_RANGE');
  });

  it('ignore every other code, including fuse openings and abnormal movement', () => {
    expect(sourceAlarmTypeOf('131420')).toBeNull();
    expect(sourceAlarmTypeOf('131401')).toBeNull();
    expect(sourceAlarmTypeOf('999999')).toBeNull();
    expect(sourceAlarmTypeOf(' 131421')).toBeNull();
    expect(sourceAlarmTypeOf('0514210')).toBe('PHASE_LOSS'); // type from "21"; channel checked apart
  });

  it('take the device from the registry: Falcon for voltage, SMAC for phases', () => {
    expect(deviceOf('NO_VOLTAGE')).toBe('FALCON');
    expect(deviceOf('PHASE_LOSS')).toBe('SMAC');
    expect(deviceOf('PHASE_OUT_OF_RANGE')).toBe('SMAC');
  });
});

describe('channelOf (Q17: 1 = A, 2 = B, 3 = C)', () => {
  it.each([
    ['1', 'A'],
    ['A', 'A'],
    ['a', 'A'],
    ['2', 'B'],
    ['B', 'B'],
    ['b', 'B'],
    ['3', 'C'],
    ['C', 'C'],
    ['c', 'C'],
  ])('channel %s is %s on both SMAC phase codes', (raw, channel) => {
    expect(channelOf(`051421${raw}`)).toBe(channel);
    expect(channelOf(`051420${raw}`)).toBe(channel);
  });

  it.each(['0', '4', '9', 'D', 'R', 'S', 'T', 'z'])(
    'channel %s is unknown: null, never guessed',
    (raw) => {
      expect(channelOf(`051421${raw}`)).toBeNull();
    },
  );

  it('is null for codes that are not SMAC phase codes', () => {
    expect(channelOf('131421')).toBeNull();
    expect(channelOf('131420')).toBeNull();
    expect(channelOf('051421')).toBeNull();
    expect(channelOf('051421AB')).toBeNull();
  });

  it('only ever gives A, B or C, never an electrical phase (Q7)', () => {
    for (const raw of ['1', '2', '3', 'a', 'b', 'c', 'A', 'B', 'C']) {
      const channel = channelOf(`051421${raw}`);
      expect(SMAC_CHANNELS).toContain(channel);
      expect(['R', 'S', 'T']).not.toContain(channel);
    }
  });
});

describe('toSourceAlarmDto', () => {
  it('NO_VOLTAGE: one entry per fuse, with its set, branch and canonical phase', () => {
    expect(toSourceAlarmDto(voltageRow({ phase: 'R1' }), NOW)).toEqual({
      fault: {
        id: `NO_VOLTAGE:0000100002-A-R:${STARTED}`,
        node: '0000100002',
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: 2,
        branch: 'A',
        alert_type: 'NO_VOLTAGE',
        device: 'FALCON',
        source_id: '0000100002-A-R',
        channel: null,
        state: 'OPEN',
        phases: ['R'],
        classification: null,
        client_count: null,
        started_at: STARTED,
        ended_at: null,
        duration_seconds: 900,
        openings: [],
        warnings: [],
      },
    });
  });

  it.each([
    ['PHASE_LOSS', '0514211', 'A'],
    ['PHASE_OUT_OF_RANGE', '051420c', 'C'],
  ])(
    '%s: one entry per transformer channel, with no fuse set and no phases',
    (type, eventCode, channel) => {
      expect(toSourceAlarmDto(smacRow({ event_code: eventCode }), NOW)).toEqual(
        {
          fault: {
            id: `${type}:0000100004-T1-3:${channel}:${STARTED}`,
            node: '0000100004',
            circuit: { id: 3, name: 'CTO 3' },
            fuses_set_id: null,
            branch: null,
            alert_type: type,
            device: 'SMAC',
            source_id: '0000100004-T1-3',
            channel,
            state: 'OPEN',
            phases: null,
            classification: null,
            client_count: null,
            started_at: STARTED,
            ended_at: null,
            duration_seconds: 900,
            openings: [],
            warnings: [],
          },
        },
      );
    },
  );

  it('takes the type and device from the event code, not from the other columns', () => {
    const fault = faultOf(
      smacRow({ fuses_set_id: 9, branch: 'B', phase: 'S' }),
    );
    expect(fault.device).toBe('SMAC');
    expect(fault.fuses_set_id).toBeNull();
    expect(fault.branch).toBeNull();
    expect(fault.phases).toBeNull();
  });

  it('never reports a SMAC channel as a phase (Q7)', () => {
    for (const code of ['051421A', '051421B', '051420C']) {
      const fault = faultOf(smacRow({ event_code: code }));
      expect(fault.phases).toBeNull();
      expect(fault.classification).toBeNull();
    }
  });

  describe('NO_VOLTAGE phase', () => {
    it('keeps the stored phase when valid, without the repetition digit', () => {
      expect(faultOf(voltageRow({ phase: 'S' })).phases).toEqual(['S']);
      expect(faultOf(voltageRow({ phase: ' t2 ' })).phases).toEqual(['T']);
    });

    it('treats legacy I/C/D like fuse-opening faults do, with no R/S/T mapping', () => {
      expect(faultOf(voltageRow({ phase: 'I' })).phases).toEqual(['I']);
    });

    it.each([['X'], ['RS'], [''], [null]])(
      'phase %p is null plus PHASES_UNCLASSIFIED, still listed',
      (phase) => {
        const fault = faultOf(voltageRow({ phase }));
        expect(fault.phases).toBeNull();
        expect(fault.warnings).toEqual(['PHASES_UNCLASSIFIED']);
      },
    );

    it('is never classified: F-49 classifies fuse-opening faults only', () => {
      expect(faultOf(voltageRow()).classification).toBeNull();
    });
  });

  describe('rows that are not listed', () => {
    it.each(['0514214', '051421D', '051420z', '0514200'])(
      'unknown channel in %s is UNKNOWN_CHANNEL',
      (code) => {
        expect(toSourceAlarmDto(smacRow({ event_code: code }), NOW)).toEqual({
          skipped: 'UNKNOWN_CHANNEL',
        });
      },
    );

    it.each(['131420', '131401', '999999', ''])(
      'code %p is NOT_A_SOURCE_ALARM',
      (code) => {
        expect(toSourceAlarmDto(voltageRow({ event_code: code }), NOW)).toEqual(
          { skipped: 'NOT_A_SOURCE_ALARM' },
        );
      },
    );

    it('a voltage alarm with no fuse set is MISSING_FUSE_SET, not set 0', () => {
      expect(toSourceAlarmDto(voltageRow({ fuses_set_id: null }), NOW)).toEqual(
        { skipped: 'MISSING_FUSE_SET' },
      );
    });
  });

  describe('ids', () => {
    it('are stable while active: same source and start give the same id', () => {
      expect(faultOf(smacRow({ event_code: '0514211' })).id).toBe(
        faultOf(smacRow({ event_code: '051421A' })).id,
      );
    });

    it('differ per channel, per type and per start', () => {
      const ids = [
        faultOf(smacRow({ event_code: '051421A' })).id,
        faultOf(smacRow({ event_code: '051421B' })).id,
        faultOf(smacRow({ event_code: '051420A' })).id,
        faultOf(
          smacRow({
            event_code: '051421A',
            started_at: new Date('2026-10-29T15:06:00.000Z'),
          }),
        ).id,
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('can never equal a fuse-opening id, which starts with the set number', () => {
      for (const fault of [faultOf(voltageRow()), faultOf(smacRow())]) {
        expect(fault.id).not.toMatch(/^\d+:/);
      }
    });

    it('sourceAlarmId puts the channel only on SMAC ids', () => {
      const at = new Date(STARTED);
      expect(sourceAlarmId('NO_VOLTAGE', 'F1', null, at)).toBe(
        `NO_VOLTAGE:F1:${STARTED}`,
      );
      expect(sourceAlarmId('PHASE_LOSS', 'T1', 'B', at)).toBe(
        `PHASE_LOSS:T1:B:${STARTED}`,
      );
    });
  });

  describe('timestamps and duration', () => {
    it('accepts started_at as a string and returns ISO UTC', () => {
      const fault = faultOf(
        smacRow({ started_at: '2026-10-29T10:05:00-05:00' }),
      );
      expect(fault.started_at).toBe(STARTED);
      expect(fault.duration_seconds).toBe(900);
    });

    it('counts whole seconds up to now', () => {
      const started = new Date(STARTED);
      expect(openDurationSeconds(started, started)).toBe(0);
      expect(
        openDurationSeconds(started, new Date(started.getTime() + 1999)),
      ).toBe(1);
      expect(openDurationSeconds(started, NOW)).toBe(900);
    });

    it('is never negative when the device clock is ahead of the server', () => {
      const fault = faultOf(
        voltageRow({ started_at: new Date('2026-10-29T15:30:00.000Z') }),
      );
      expect(fault.duration_seconds).toBe(0);
    });

    it('keeps the entry open: state OPEN, ended_at null, no openings', () => {
      for (const fault of [faultOf(voltageRow()), faultOf(smacRow())]) {
        expect(fault.state).toBe('OPEN');
        expect(fault.ended_at).toBeNull();
        expect(fault.openings).toEqual([]);
        expect(fault.client_count).toBeNull();
      }
    });
  });
});
