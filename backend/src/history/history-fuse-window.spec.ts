import {
  type FuseEvent,
  type FuseFault,
  groupFuseFaults,
} from '../faults/fault-grouping';

/**
 * SCRUM-283 · F-66: the reduced read of HISTORY_FUSE_EVENTS_SQL (history-queries.ts) must give
 * exactly the faults that grouping the WHOLE history gives, for every fault that starts in
 * [from, to), complete as of read-until.
 *
 * `reducedRead` mirrors the SQL selection in TypeScript (the SQL itself is checked against the
 * database by the e2e cross-check): candidate sets = sets with a SET in [from, to); events of those
 * sets in [L, readUntil] with L = from - window; plus, per fuse of a candidate set, its last event
 * before L when it is a SET (at the same instant the SET wins). Random histories come from a small
 * seeded generator, so a failure is reproducible.
 */

const MINUTE = 60_000;
const BASE = Date.UTC(2026, 0, 5, 5, 0, 0);

function reducedRead(
  all: readonly FuseEvent[],
  windowMinutes: number,
  from: number,
  to: number,
  readUntil: number,
): FuseEvent[] {
  const lookback = from - windowMinutes * MINUTE;
  const windowEvents = all.filter(
    (event) =>
      event.at.getTime() >= lookback && event.at.getTime() <= readUntil,
  );
  const candidates = new Set(
    windowEvents
      .filter(
        (event) =>
          event.type === 'SET' &&
          event.at.getTime() >= from &&
          event.at.getTime() < to,
      )
      .map((event) => event.fusesSetId),
  );

  const lastBefore = new Map<string, FuseEvent>();
  for (const event of all) {
    if (!candidates.has(event.fusesSetId)) continue;
    if (event.at.getTime() >= lookback) continue;
    const current = lastBefore.get(event.fuseId);
    const later =
      !current ||
      event.at.getTime() > current.at.getTime() ||
      (event.at.getTime() === current.at.getTime() && event.type === 'SET');
    if (later) lastBefore.set(event.fuseId, event);
  }
  const seeds = [...lastBefore.values()]
    .filter((event) => event.type === 'SET')
    .map((event) => ({ ...event }));

  return [
    ...seeds,
    ...windowEvents.filter((event) => candidates.has(event.fusesSetId)),
  ];
}

function startedIn(faults: FuseFault[], from: number, to: number): FuseFault[] {
  return faults.filter(
    (fault) =>
      fault.startedAt.getTime() >= from && fault.startedAt.getTime() < to,
  );
}

function expectSameFaults(
  all: readonly FuseEvent[],
  windowMinutes: number,
  from: number,
  to: number,
  readUntil: number,
): void {
  const complete = startedIn(
    groupFuseFaults(
      all.filter((event) => event.at.getTime() <= readUntil),
      windowMinutes,
    ),
    from,
    to,
  );
  const reduced = startedIn(
    groupFuseFaults(
      reducedRead(all, windowMinutes, from, to, readUntil),
      windowMinutes,
    ),
    from,
    to,
  );
  expect(reduced).toEqual(complete);
}

const event = (
  set: number,
  phase: string,
  type: 'SET' | 'CLEAR',
  minute: number,
): FuseEvent => ({
  fusesSetId: set,
  fuseId: `set${set}-${phase}`,
  phase,
  type,
  at: new Date(BASE + minute * MINUTE),
});

/** mulberry32: small, fast, seeded. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('Historical fuse read: reduced window equals the complete history (F-66)', () => {
  const W = 5;
  const at = (minute: number) => BASE + minute * MINUTE;

  it('ignores repeated SETs of a fuse that was open before the lookback', () => {
    const all = [event(1, 'R', 'SET', 0), event(1, 'R', 'SET', 600)];
    expectSameFaults(all, W, at(300), at(900), at(2000));
    // The fault started before `from`: nothing is counted in the range.
    expect(startedIn(groupFuseFaults(all, W), at(300), at(900))).toHaveLength(
      0,
    );
  });

  it('keeps a chain that crosses `from` out of the range', () => {
    const all = [event(1, 'R', 'SET', 100), event(1, 'S', 'SET', 103)];
    expectSameFaults(all, W, at(102), at(500), at(600));
    expect(startedIn(groupFuseFaults(all, W), at(102), at(500))).toEqual([]);
  });

  it('starts a new fault after a gap exactly equal to the window', () => {
    const all = [event(1, 'R', 'SET', 100), event(1, 'S', 'SET', 105)];
    expectSameFaults(all, W, at(101), at(500), at(600));
    expect(startedIn(groupFuseFaults(all, W), at(101), at(500))).toHaveLength(
      1,
    );
  });

  it('treats a SET and a CLEAR at the same instant before the lookback as an open fuse', () => {
    const all = [
      event(1, 'R', 'SET', 0),
      event(1, 'R', 'CLEAR', 0),
      event(1, 'R', 'SET', 400),
      event(1, 'S', 'SET', 401),
    ];
    expectSameFaults(all, W, at(300), at(900), at(1000));
  });

  it('ignores a CLEAR with no SET before it', () => {
    const all = [event(1, 'R', 'CLEAR', 50), event(1, 'R', 'SET', 400)];
    expectSameFaults(all, W, at(300), at(900), at(1000));
  });

  it('returns complete faults: openings and closes after `to` are included', () => {
    const all = [
      event(1, 'R', 'SET', 100),
      event(1, 'S', 'SET', 102),
      event(1, 'R', 'CLEAR', 300),
      event(1, 'S', 'CLEAR', 400),
    ];
    const faults = startedIn(
      groupFuseFaults(reducedRead(all, W, at(50), at(101), at(1000)), W),
      at(50),
      at(101),
    );
    expect(faults).toHaveLength(1);
    expect(faults[0].openings).toHaveLength(2);
    expect(faults[0].endedAt?.getTime()).toBe(at(400));
    expectSameFaults(all, W, at(50), at(101), at(1000));
  });

  it('matches the complete history on 400 seeded random histories and ranges', () => {
    const random = seeded(283);
    const gaps = [0, 1, W - 1, W, W + 1, 2, 7, 30, 90];

    for (let round = 0; round < 400; round += 1) {
      const windowMinutes = random() < 0.5 ? W : 3;
      const all: FuseEvent[] = [];
      for (let set = 1; set <= 3; set += 1) {
        let minute = Math.floor(random() * 60);
        for (let index = 0; index < 25; index += 1) {
          minute += gaps[Math.floor(random() * gaps.length)];
          const phase = ['R', 'S', 'T'][Math.floor(random() * 3)];
          const type = random() < 0.6 ? 'SET' : 'CLEAR';
          all.push(event(set, phase, type, minute));
        }
      }
      const span = Math.max(...all.map((item) => item.at.getTime())) - BASE;
      for (let range = 0; range < 5; range += 1) {
        const from = BASE + Math.floor(random() * span);
        const to = from + MINUTE + Math.floor(random() * span);
        const readUntil = to + Math.floor(random() * span);
        expectSameFaults(all, windowMinutes, from, to, readUntil);
      }
    }
  });
});
