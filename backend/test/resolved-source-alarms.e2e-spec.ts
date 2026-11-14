import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActiveFaultsService } from '../src/faults/active-faults.service';
import { SourceAlarmEpisode } from '../src/faults/source-alarms';
import { ScopeContext } from '../src/scope/scope.types';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-226 · F-59 / F-60 against a real database, through the service (there is no route yet):
// RESOLVED_SOURCE_ALARMS_SQL rebuilds every episode of a source alarm from `alarms`, from its first
// SET to the next CLEAR, and returns the ones resolved at or after a given instant.
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-226 resolved source alarms';
const USER = 'resolved-source-alarms-e2e-circuit1@test.local';
const HW = 'SRE2E-'; // prefix of every hw_id this spec writes
const IN_SCOPE_CIRCUIT = 1;
const OTHER_CIRCUIT = 3;
const SET_ID = 990_301; // explicit ids: the seed does not move the sequences

const MINUTE = 60_000;
/** Fixed past instant: every event is at a whole number of minutes after it. */
const BASE = Date.parse('2026-01-10T08:00:00.000Z');
const at = (minutes: number) => new Date(BASE + minutes * MINUTE);
const iso = (minutes: number) => at(minutes).toISOString();

const VOLTAGE = '131421';
const FUSE_OPENING = '131420';
const FALCON_NODE = 'SRE2EF0001';
const FALCON_OTHER = 'SRE2EF0009';
const SMAC_NODE = 'SRE2ES0001';
const TRAFO = 'SRE2ES0001-T1-3';
const fuseOf = (letter: string) => `${FALCON_NODE}-${letter}`;

const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

interface Alarm {
  customId: string;
  code: string;
  type: string;
  minute: number;
  /** Defaults to one synthetic device per source; set it to put two events at one instant. */
  hwId?: string;
}

/** Every alarm event of this spec. The comments give the expected episodes. */
const ALARMS: Alarm[] = [
  // --- NO_VOLTAGE (13xx21) ---
  // R: repeated SET (two firmware versions) then CLEAR, a second cycle, and a SET still open.
  //    Episodes 0→30 and 60→80; active from 100.
  { customId: fuseOf('R'), code: VOLTAGE, type: 'SET', minute: 0 },
  { customId: fuseOf('R'), code: '131321', type: 'SET', minute: 10 },
  { customId: fuseOf('R'), code: '131521', type: 'CLEAR', minute: 30 },
  { customId: fuseOf('R'), code: VOLTAGE, type: 'SET', minute: 60 },
  { customId: fuseOf('R'), code: VOLTAGE, type: 'CLEAR', minute: 80 },
  { customId: fuseOf('R'), code: VOLTAGE, type: 'SET', minute: 100 },
  // S: lower-case types, 0→20. A fuse opening on the same fuse is not a source alarm.
  { customId: fuseOf('S'), code: VOLTAGE, type: 'set', minute: 0 },
  { customId: fuseOf('S'), code: FUSE_OPENING, type: 'SET', minute: 5 },
  { customId: fuseOf('S'), code: FUSE_OPENING, type: 'CLEAR', minute: 15 },
  { customId: fuseOf('S'), code: VOLTAGE, type: 'clear', minute: 20 },
  // T: a SET and a CLEAR at the same instant while an earlier SET is open: 0→40.
  { customId: fuseOf('T'), code: VOLTAGE, type: 'SET', minute: 0 },
  {
    customId: fuseOf('T'),
    code: VOLTAGE,
    type: 'SET',
    minute: 40,
    hwId: `${HW}T-OLD`,
  },
  { customId: fuseOf('T'), code: VOLTAGE, type: 'CLEAR', minute: 40 },
  // U: SET and CLEAR at the same instant, nothing open before: zero length, no episode (D3-B).
  {
    customId: fuseOf('U'),
    code: VOLTAGE,
    type: 'SET',
    minute: 50,
    hwId: `${HW}U-OLD`,
  },
  { customId: fuseOf('U'), code: VOLTAGE, type: 'CLEAR', minute: 50 },
  // V: one episode 0→10, then a zero-length one at 50 (D3-B).
  { customId: fuseOf('V'), code: VOLTAGE, type: 'SET', minute: 0 },
  { customId: fuseOf('V'), code: VOLTAGE, type: 'CLEAR', minute: 10 },
  {
    customId: fuseOf('V'),
    code: VOLTAGE,
    type: 'SET',
    minute: 50,
    hwId: `${HW}V-OLD`,
  },
  { customId: fuseOf('V'), code: VOLTAGE, type: 'CLEAR', minute: 50 },
  // W: a CLEAR with no SET before it ends nothing; then 20→30.
  { customId: fuseOf('W'), code: VOLTAGE, type: 'CLEAR', minute: 10 },
  { customId: fuseOf('W'), code: VOLTAGE, type: 'SET', minute: 20 },
  { customId: fuseOf('W'), code: VOLTAGE, type: 'CLEAR', minute: 30 },
  // X: never cleared, so active from 0; an event of another type is ignored.
  { customId: fuseOf('X'), code: VOLTAGE, type: 'SET', minute: 0 },
  { customId: fuseOf('X'), code: VOLTAGE, type: 'MSG', minute: 10 },
  // Y: a long episode, 0→200.
  { customId: fuseOf('Y'), code: VOLTAGE, type: 'SET', minute: 0 },
  { customId: fuseOf('Y'), code: VOLTAGE, type: 'CLEAR', minute: 200 },
  // Circuit 3, outside the consultation user's scope: 0→30.
  { customId: `${FALCON_OTHER}-R`, code: VOLTAGE, type: 'SET', minute: 0 },
  { customId: `${FALCON_OTHER}-R`, code: VOLTAGE, type: 'CLEAR', minute: 30 },

  // --- SMAC phase alarms, one transformer ---
  // PHASE_LOSS A, spelled 1, A and a: 0→25 (repeated SET at 5); firmware 15: 70→90.
  { customId: TRAFO, code: '0514211', type: 'SET', minute: 0 },
  { customId: TRAFO, code: '051421A', type: 'SET', minute: 5 },
  { customId: TRAFO, code: '051421a', type: 'CLEAR', minute: 25 },
  { customId: TRAFO, code: '051521A', type: 'SET', minute: 70 },
  { customId: TRAFO, code: '0515211', type: 'CLEAR', minute: 90 },
  // PHASE_LOSS B, SET as B and CLEAR as 2: 10→35.
  { customId: TRAFO, code: '051421B', type: 'SET', minute: 10 },
  { customId: TRAFO, code: '0514212', type: 'CLEAR', minute: 35 },
  // PHASE_OUT_OF_RANGE A: independent of PHASE_LOSS A, 0→45.
  { customId: TRAFO, code: '051420A', type: 'SET', minute: 0 },
  { customId: TRAFO, code: '051420A', type: 'CLEAR', minute: 45 },
  // PHASE_LOSS C, SET as C and CLEAR as 3 at the same instant: zero length, no episode (D3-B).
  { customId: TRAFO, code: '051421C', type: 'SET', minute: 50 },
  { customId: TRAFO, code: '0514213', type: 'CLEAR', minute: 50 },
  // Unknown channel D: an episode the service skips and logs.
  { customId: TRAFO, code: '051421D', type: 'SET', minute: 0 },
  { customId: TRAFO, code: '051421D', type: 'CLEAR', minute: 20 },
];

/** Expected resolved episodes: type, source, channel, start minute, end minute, circuit. */
type Expected = [string, string, string | null, number, number, number];
const EXPECTED: Expected[] = [
  ['NO_VOLTAGE', fuseOf('R'), null, 0, 30, 1],
  ['NO_VOLTAGE', fuseOf('R'), null, 60, 80, 1],
  ['NO_VOLTAGE', fuseOf('S'), null, 0, 20, 1],
  ['NO_VOLTAGE', fuseOf('T'), null, 0, 40, 1],
  ['NO_VOLTAGE', fuseOf('V'), null, 0, 10, 1],
  ['NO_VOLTAGE', fuseOf('W'), null, 20, 30, 1],
  ['NO_VOLTAGE', fuseOf('Y'), null, 0, 200, 1],
  ['NO_VOLTAGE', `${FALCON_OTHER}-R`, null, 0, 30, 3],
  ['PHASE_LOSS', TRAFO, 'A', 0, 25, 1],
  ['PHASE_LOSS', TRAFO, 'A', 70, 90, 1],
  ['PHASE_LOSS', TRAFO, 'B', 10, 35, 1],
  ['PHASE_OUT_OF_RANGE', TRAFO, 'A', 0, 45, 1],
];

const FUSES: Array<[letter: string, phase: string]> = [
  ['R', 'R'],
  ['S', 'S'],
  ['T', 'T2'],
  ['U', 'R'],
  ['V', 'S'],
  ['W', 'T'],
  ['X', 'R'],
  ['Y', 'S'],
];

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [`${HW}%`]);
  await removeSmacNodes(dataSource, [SMAC_NODE], []);
  await removeFalconNodes(dataSource, [FALCON_NODE, FALCON_OTHER], []);
  await dataSource.query('DELETE FROM users WHERE username = $1', [USER]);
}

/** A consultation user scoped to circuit 1; it never logs in, so its hash is random. */
async function createUser(dataSource: DataSource): Promise<number> {
  const [user]: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'consultation user', TRUE) RETURNING id`,
    [USER, randomBytes(18).toString('base64url')],
  );
  await dataSource.query(
    "INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', $2)",
    [user.id, String(IN_SCOPE_CIRCUIT)],
  );
  return user.id;
}

async function createSources(dataSource: DataSource): Promise<void> {
  const fuse = (customId: string, phase: string) => ({
    customId,
    phase,
    hwId: null,
    reading: null,
  });
  await createFalconNodes(
    dataSource,
    [
      {
        node: FALCON_NODE,
        fuseSetId: SET_ID,
        fuses: FUSES.map(([letter, phase]) => fuse(fuseOf(letter), phase)),
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
  await createFalconNodes(
    dataSource,
    [
      {
        node: FALCON_OTHER,
        fuseSetId: SET_ID + 1,
        fuses: [fuse(`${FALCON_OTHER}-R`, 'R')],
      },
    ],
    OTHER_CIRCUIT,
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODE,
        transformers: [{ customId: TRAFO, hwId: null, readings: [] }],
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
}

async function insertAlarms(
  dataSource: DataSource,
  alarms: Alarm[],
): Promise<void> {
  for (const alarm of alarms) {
    await dataSource.query(
      `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
       VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
      [
        alarm.hwId ?? `${HW}${alarm.customId}`,
        alarm.customId,
        alarm.code,
        alarm.type,
        at(alarm.minute),
      ],
    );
  }
}

const ours = (episodes: SourceAlarmEpisode[]) =>
  episodes.filter((episode) => episode.node.startsWith('SRE2E'));
const summary = (episode: SourceAlarmEpisode): Expected => [
  episode.alertType,
  episode.sourceId,
  episode.channel,
  (episode.startedAt.getTime() - BASE) / MINUTE,
  (episode.endedAt === null ? NaN : episode.endedAt.getTime() - BASE) / MINUTE,
  episode.circuit.id,
];
const byEndThenKey = (a: Expected, b: Expected) =>
  a[4] - b[4] ||
  a[0].localeCompare(b[0]) ||
  a[1].localeCompare(b[1]) ||
  (a[2] ?? '').localeCompare(b[2] ?? '') ||
  a[3] - b[3];
const endingFrom = (minutes: number) =>
  EXPECTED.filter((episode) => episode[4] >= minutes).sort(byEndThenKey);

describe('Resolved source alarms (SCRUM-226 · F-59, F-60, e2e)', () => {
  let started: IsolatedApp | undefined;
  let userId: number;
  let warn: jest.SpyInstance;

  const service = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.get(ActiveFaultsService);
  };
  const resolved = async (since: Date, scope: ScopeContext = UNRESTRICTED) =>
    ours(await service().resolvedSourceAlarms(scope, since));
  const activeSourceAlarms = async () =>
    (await service().activeFaults(UNRESTRICTED)).faults.filter(
      (fault) =>
        fault.node.startsWith('SRE2E') && fault.alert_type !== 'FUSE_OPENING',
    );

  beforeAll(async () => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        userId = await createUser(db);
        await createSources(db);
        await insertAlarms(db, ALARMS);
      },
    });
  });

  afterAll(async () => {
    try {
      await stopIsolatedApp(started, LABEL, remove);
    } finally {
      warn.mockRestore();
    }
  });

  it('rebuilds every resolved episode: first SET to next CLEAR, cycles kept apart', async () => {
    const episodes = await resolved(at(0));

    expect(episodes.map(summary)).toEqual(endingFrom(0));
  });

  it('returns the documented episode fields, times from the alarm records', async () => {
    const episodes = await resolved(at(0));
    const [voltage] = episodes.filter(
      (episode) => episode.sourceId === fuseOf('T'),
    );
    const [phase] = episodes.filter(
      (episode) =>
        episode.alertType === 'PHASE_LOSS' && episode.channel === 'B',
    );

    expect(voltage).toEqual({
      id: `NO_VOLTAGE:${fuseOf('T')}:${iso(0)}`,
      alertType: 'NO_VOLTAGE',
      sourceId: fuseOf('T'),
      channel: null,
      node: FALCON_NODE,
      circuit: { id: 1, name: 'CTO 1' },
      fuse: { fusesSetId: SET_ID, branch: null, phase: 'T2' },
      state: 'RESOLVED',
      startedAt: at(0),
      endedAt: at(40),
    });
    expect(phase).toEqual({
      id: `PHASE_LOSS:${TRAFO}:B:${iso(10)}`,
      alertType: 'PHASE_LOSS',
      sourceId: TRAFO,
      channel: 'B',
      node: SMAC_NODE,
      circuit: { id: 1, name: 'CTO 1' },
      fuse: null,
      state: 'RESOLVED',
      startedAt: at(10),
      endedAt: at(35),
    });
  });

  describe('lifecycle', () => {
    let episodes: SourceAlarmEpisode[];
    const of = (type: string, source: string, channel: string | null = null) =>
      episodes
        .filter(
          (episode) =>
            episode.alertType === type &&
            episode.sourceId === source &&
            episode.channel === channel,
        )
        .map(summary)
        .map(([, , , start, end]) => [start, end]);

    beforeAll(async () => {
      episodes = await resolved(at(0));
    });

    it('repeated SETs keep the first activation (F-59), across firmware versions', () => {
      expect(of('NO_VOLTAGE', fuseOf('R'))).toEqual([
        [0, 30],
        [60, 80],
      ]);
      expect(of('PHASE_LOSS', TRAFO, 'A')).toEqual([
        [0, 25],
        [70, 90],
      ]);
    });

    it('the CLEAR resolves the episode at its recorded_at (F-60), lower case included', () => {
      expect(of('NO_VOLTAGE', fuseOf('S'))).toEqual([[0, 20]]);
      expect(of('NO_VOLTAGE', fuseOf('Y'))).toEqual([[0, 200]]);
    });

    it('a CLEAR with no SET before it ends nothing', () => {
      expect(of('NO_VOLTAGE', fuseOf('W'))).toEqual([[20, 30]]);
    });

    it('a CLEAR at the same instant as a SET ends the episode open before it (CLEAR wins)', () => {
      expect(of('NO_VOLTAGE', fuseOf('T'))).toEqual([[0, 40]]);
    });

    it('excludes zero-length episodes (provisional decision D3-B, pending team review)', () => {
      expect(of('NO_VOLTAGE', fuseOf('U'))).toEqual([]);
      expect(of('NO_VOLTAGE', fuseOf('V'))).toEqual([[0, 10]]);
      expect(of('PHASE_LOSS', TRAFO, 'C')).toEqual([]);
    });

    it('treats 1/A and 2/B as one channel, and the two SMAC types independently', () => {
      expect(of('PHASE_LOSS', TRAFO, 'B')).toEqual([[10, 35]]);
      expect(of('PHASE_OUT_OF_RANGE', TRAFO, 'A')).toEqual([[0, 45]]);
    });

    it('never returns an episode that is still open, nor fuse openings or other event types', () => {
      expect(episodes.every((episode) => episode.state === 'RESOLVED')).toBe(
        true,
      );
      expect(of('NO_VOLTAGE', fuseOf('X'))).toEqual([]);
      expect(
        episodes.some(
          (episode) => episode.startedAt.getTime() === at(100).getTime(),
        ),
      ).toBe(false);
    });

    it('skips an unknown SMAC channel and logs it once as a resolved alarm', async () => {
      await resolved(at(0));

      expect(JSON.stringify(episodes)).not.toContain('"D"');
      const reports = warn.mock.calls.filter((call) =>
        String(call[0]).includes('"051421D"'),
      );
      expect(reports).toHaveLength(1);
      expect(String(reports[0][0])).toMatch(
        /^Resolved alarm .*UNKNOWN_CHANNEL$/,
      );
    });
  });

  describe('resolvedSince', () => {
    it('includes an episode resolved exactly at resolvedSince', async () => {
      const episodes = await resolved(at(30));

      expect(episodes.map(summary)).toEqual(endingFrom(30));
      expect(
        episodes.filter(
          (episode) => episode.endedAt?.getTime() === at(30).getTime(),
        ),
      ).toHaveLength(3);
    });

    it('excludes it one millisecond later', async () => {
      const episodes = await resolved(new Date(at(30).getTime() + 1));

      expect(episodes.map(summary)).toEqual(endingFrom(31));
    });

    it('compares with the resolution, not the start: an episode older than resolvedSince is kept', async () => {
      const episodes = await resolved(at(150));

      expect(episodes.map(summary)).toEqual([
        ['NO_VOLTAGE', fuseOf('Y'), null, 0, 200, 1],
      ]);
    });

    it('returns nothing after the last CLEAR', async () => {
      expect(await resolved(at(201))).toEqual([]);
    });
  });

  describe('scope (F-10)', () => {
    it('a circuit-1 user gets the episodes of circuit 1 only', async () => {
      const episodes = await resolved(at(0), {
        kind: 'restricted',
        userId,
      });

      expect(episodes.map(summary)).toEqual(
        endingFrom(0).filter((episode) => episode[5] === IN_SCOPE_CIRCUIT),
      );
    });

    it('an empty scope gets nothing', async () => {
      expect(await resolved(at(0), { kind: 'empty' })).toEqual([]);
    });
  });

  describe('agreement with the active list', () => {
    it('the alarms left open are exactly the active ones, from the first SET after the last CLEAR', async () => {
      const active = await activeSourceAlarms();

      expect(
        active.map((fault) => [fault.source_id, fault.started_at]),
      ).toEqual([
        [fuseOf('X'), iso(0)],
        [fuseOf('R'), iso(100)],
      ]);
    });

    it('a CLEAR resolves the active alarm, keeping its id and start (F-60)', async () => {
      const [before] = (await activeSourceAlarms()).filter(
        (fault) => fault.source_id === fuseOf('X'),
      );

      await insertAlarms((started as IsolatedApp).dataSource, [
        { customId: fuseOf('X'), code: VOLTAGE, type: 'CLEAR', minute: 120 },
      ]);
      const [after] = (await resolved(at(120))).filter(
        (episode) => episode.sourceId === fuseOf('X'),
      );

      expect(after).toMatchObject({
        id: before.id,
        state: 'RESOLVED',
        startedAt: new Date(before.started_at),
        endedAt: at(120),
      });
      expect(
        (await activeSourceAlarms()).map((fault) => fault.source_id),
      ).toEqual([fuseOf('R')]);
    });
  });
});
