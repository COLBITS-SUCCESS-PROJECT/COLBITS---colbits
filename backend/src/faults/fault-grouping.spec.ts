import { FuseEvent, groupFuseFaults } from './fault-grouping';

const T0 = Date.UTC(2026, 9, 29, 10, 0, 0);
const at = (minutes: number, seconds = 0): Date =>
  new Date(T0 + minutes * 60_000 + seconds * 1000);

const set = (
  fusesSetId: number,
  fuseId: string,
  phase: string,
  when: Date,
): FuseEvent => ({ fusesSetId, fuseId, phase, type: 'SET', at: when });
const clear = (
  fusesSetId: number,
  fuseId: string,
  phase: string,
  when: Date,
): FuseEvent => ({ fusesSetId, fuseId, phase, type: 'CLEAR', at: when });

const R = (when: Date, setId = 1) => set(setId, `N-R${setId}`, 'R', when);
const S = (when: Date, setId = 1) => set(setId, `N-S${setId}`, 'S', when);
const T = (when: Date, setId = 1) => set(setId, `N-T${setId}`, 'T', when);

const WINDOW = 5;

/** Every ordering of the items. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe('groupFuseFaults (US10 · F-48)', () => {
  describe('window boundary: strictly less than the window groups', () => {
    it.each([
      ['W - 1 s groups', at(4, 59), 1],
      ['exactly W does not group', at(5), 2],
      ['W + 1 s does not group', at(5, 1), 2],
      ['a few seconds apart groups', at(0, 20), 1],
    ])('%s', (_label, secondOpening, faultCount) => {
      const faults = groupFuseFaults([R(at(0)), S(secondOpening)], WINDOW);
      expect(faults).toHaveLength(faultCount);
    });
  });

  describe('chained window', () => {
    it('keeps joining openings that are each inside the window of the previous one', () => {
      // 0, 4, 8: the third is 8 min after the first, but 4 min after the second.
      const faults = groupFuseFaults([R(at(0)), S(at(4)), T(at(8))], WINDOW);
      expect(faults).toHaveLength(1);
      expect(faults[0].openings.map((o) => o.phase)).toEqual(['R', 'S', 'T']);
    });

    it('starts a new fault when the gap to the previous opening reaches the window', () => {
      // 0, 4, 8, then 13: 13 - 8 = 5 = W.
      const faults = groupFuseFaults(
        [R(at(0)), S(at(4)), T(at(8)), set(1, 'N-R1-again', 'R', at(13))],
        WINDOW,
      );
      expect(faults.map((f) => f.openings.length)).toEqual([3, 1]);
    });

    it('measures the gap between openings, not between a close and the next opening', () => {
      // The first fuse closes at 1 min; the second opens at 6 min: 6 >= 5, separate faults.
      const faults = groupFuseFaults(
        [R(at(0)), clear(1, 'N-R1', 'R', at(1)), S(at(6))],
        WINDOW,
      );
      expect(faults).toHaveLength(2);
    });

    it('does not let a close split or join faults', () => {
      // R stays open for 30 min, S opens 2 min after R: still one fault.
      const faults = groupFuseFaults(
        [R(at(0)), S(at(2)), clear(1, 'N-R1', 'R', at(30))],
        WINDOW,
      );
      expect(faults).toHaveLength(1);
    });

    it('does not group a late opening with a fuse that has been open for a long time', () => {
      const faults = groupFuseFaults([R(at(0)), S(at(30))], WINDOW);
      expect(faults).toHaveLength(2);
      expect(faults.map((f) => f.state)).toEqual(['OPEN', 'OPEN']);
    });
  });

  describe('the window is a parameter (NF-09)', () => {
    const events = [R(at(0)), S(at(4))];

    it.each([
      [3, 2],
      [4, 2],
      [5, 1],
      [10, 1],
      [4.5, 1],
      [0.5, 2],
    ])(
      'with a %s min window, openings 4 min apart give %s fault(s)',
      (window, count) => {
        expect(groupFuseFaults(events, window)).toHaveLength(count);
      },
    );

    it.each([[0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
      'throws for the window %s',
      (window) => {
        expect(() => groupFuseFaults(events, window)).toThrow(RangeError);
      },
    );
  });

  describe('separation by fuse set (F-50)', () => {
    it('keeps the openings of different fuse sets of one node as separate faults, phases not summed', () => {
      // Set 1 (branch A): R open. Set 2 (branch B): R and S open. Never one three-phase fault.
      const faults = groupFuseFaults(
        [R(at(0), 1), R(at(0, 5), 2), S(at(0, 10), 2)],
        WINDOW,
      );
      expect(faults).toHaveLength(2);
      const bySet = Object.fromEntries(
        faults.map((f) => [f.fusesSetId, f.openings.length]),
      );
      expect(bySet).toEqual({ 1: 1, 2: 2 });
    });

    it('groups each set on its own clock', () => {
      // Set 2 opens inside the window of set 1 but 10 min after its own previous opening.
      const faults = groupFuseFaults(
        [R(at(0), 1), R(at(1), 2), S(at(11), 2), S(at(2), 1)],
        WINDOW,
      );
      expect(faults.map((f) => [f.fusesSetId, f.openings.length])).toEqual([
        [1, 2],
        [2, 1],
        [2, 1],
      ]);
    });
  });

  describe('SET and CLEAR handling', () => {
    it('is OPEN, without end, while the fuse has not reported a close', () => {
      const [fault] = groupFuseFaults([R(at(0))], WINDOW);
      expect(fault.state).toBe('OPEN');
      expect(fault.endedAt).toBeNull();
      expect(fault.startedAt).toEqual(at(0));
      expect(fault.openings[0].closedAt).toBeNull();
    });

    it('is RESOLVED at the close reported by the device', () => {
      const [fault] = groupFuseFaults(
        [R(at(0)), clear(1, 'N-R1', 'R', at(12))],
        WINDOW,
      );
      expect(fault.state).toBe('RESOLVED');
      expect(fault.startedAt).toEqual(at(0));
      expect(fault.endedAt).toEqual(at(12));
    });

    it('stays OPEN while at least one phase has not closed', () => {
      const [fault] = groupFuseFaults(
        [
          R(at(0)),
          S(at(0, 10)),
          T(at(0, 20)),
          clear(1, 'N-R1', 'R', at(5)),
          clear(1, 'N-S1', 'S', at(6)),
        ],
        WINDOW,
      );
      expect(fault.state).toBe('OPEN');
      expect(fault.endedAt).toBeNull();
    });

    it('ends at the last close, whichever phase reports it, and not at the last opening', () => {
      const [fault] = groupFuseFaults(
        [
          R(at(0)),
          S(at(1)),
          clear(1, 'N-S1', 'S', at(5)),
          clear(1, 'N-R1', 'R', at(10)),
        ],
        WINDOW,
      );
      expect(fault.state).toBe('RESOLVED');
      expect(fault.endedAt).toEqual(at(10));
    });

    it('counts a momentary opening: a close reported one second after the opening', () => {
      const [fault] = groupFuseFaults(
        [R(at(3)), clear(1, 'N-R1', 'R', at(3, 1))],
        WINDOW,
      );
      expect(fault.state).toBe('RESOLVED');
      expect(fault.startedAt).toEqual(at(3));
      expect(fault.endedAt).toEqual(at(3, 1));
    });

    describe('SET and CLEAR of one fuse at the same instant (order not given by the data)', () => {
      const same = (build: (when: Date) => FuseEvent[]) => [
        build(at(3)),
        [...build(at(3))].reverse(),
      ];

      it('takes a closed fuse as open afterwards, in either input order, instead of hiding it', () => {
        for (const events of same((when) => [
          set(1, 'N-R1', 'R', when),
          clear(1, 'N-R1', 'R', when),
        ])) {
          const [fault, ...rest] = groupFuseFaults(events, WINDOW);
          expect(rest).toHaveLength(0);
          expect(fault.state).toBe('OPEN');
          expect(fault.endedAt).toBeNull();
          expect(fault.startedAt).toEqual(at(3));
        }
      });

      it('keeps the reopening of a fuse that was already open, in either input order', () => {
        for (const events of same((when) => [
          set(1, 'N-R1', 'R', when),
          clear(1, 'N-R1', 'R', when),
        ])) {
          const [fault, ...rest] = groupFuseFaults(
            [R(at(0)), ...events],
            WINDOW,
          );
          expect(rest).toHaveLength(0);
          expect(fault.openings.map((o) => o.closedAt)).toEqual([at(3), null]);
          expect(fault.state).toBe('OPEN');
        }
      });
    });

    it('keeps a fuse that closes and opens again inside the window in the same fault', () => {
      const [fault, ...rest] = groupFuseFaults(
        [R(at(0)), clear(1, 'N-R1', 'R', at(1)), set(1, 'N-R1', 'R', at(3))],
        WINDOW,
      );
      expect(rest).toHaveLength(0);
      expect(fault.openings).toHaveLength(2);
      expect(fault.openings[0].closedAt).toEqual(at(1));
      expect(fault.openings[1].closedAt).toBeNull();
      expect(fault.state).toBe('OPEN');
    });

    it('ignores a repeated SET on a fuse that is already open, so it cannot stretch the chain', () => {
      // R opens at 0 and repeats at 3; S opens at 7. Without the repeat, 7 - 0 >= 5: two faults.
      const faults = groupFuseFaults([R(at(0)), R(at(3)), S(at(7))], WINDOW);
      expect(faults).toHaveLength(2);
      expect(faults[0].openings).toHaveLength(1);
    });

    it('ignores a CLEAR with no open SET before it', () => {
      expect(groupFuseFaults([clear(1, 'N-R1', 'R', at(5))], WINDOW)).toEqual(
        [],
      );
    });

    it('closes only the fuse that reported', () => {
      const [fault] = groupFuseFaults(
        [R(at(0)), S(at(1)), clear(1, 'N-S1', 'S', at(4))],
        WINDOW,
      );
      expect(fault.openings.map((o) => o.closedAt)).toEqual([null, at(4)]);
      expect(fault.state).toBe('OPEN');
    });
  });

  describe('input handling', () => {
    it('returns no faults for no events', () => {
      expect(groupFuseFaults([], WINDOW)).toEqual([]);
    });

    it('does not depend on the order of the events', () => {
      const events = [
        R(at(0)),
        clear(1, 'N-R1', 'R', at(8)),
        S(at(2)),
        T(at(3)),
        R(at(20), 2),
      ];
      const reversed = [...events].reverse();
      expect(groupFuseFaults(reversed, WINDOW)).toEqual(
        groupFuseFaults(events, WINDOW),
      );
    });

    it('gives the same result for simultaneous SET events on different fuses in any input order', () => {
      // Three fuses of one set open at the same instant; ids deliberately not in phase order.
      const events = [
        set(1, 'B-fuse', 'R', at(0)),
        set(1, 'C-fuse', 'T', at(0)),
        set(1, 'A-fuse', 'S', at(0)),
      ];
      const expected = groupFuseFaults(events, WINDOW);

      expect(expected).toHaveLength(1);
      expect(expected[0].openings.map((o) => o.fuseId)).toEqual([
        'A-fuse',
        'B-fuse',
        'C-fuse',
      ]);
      for (const order of permutations(events)) {
        expect(groupFuseFaults(order, WINDOW)).toEqual(expected);
      }
    });

    it('gives the same result for simultaneous events of several sets and types in any input order', () => {
      const events = [
        R(at(0), 1),
        S(at(0), 1),
        R(at(0), 2),
        clear(1, 'N-R1', 'R', at(4)),
        set(1, 'N-R1', 'R', at(4)),
      ];
      const expected = groupFuseFaults(events, WINDOW);

      for (const order of permutations(events)) {
        expect(groupFuseFaults(order, WINDOW)).toEqual(expected);
      }
    });

    it('treats duplicate rows of one fuse at one instant as one event, in any input order', () => {
      // e.g. the same fuse reported through two devices; the second SET is a repeat.
      const events = [R(at(0)), R(at(0)), clear(1, 'N-R1', 'R', at(2))];
      for (const order of permutations(events)) {
        const [fault, ...rest] = groupFuseFaults(order, WINDOW);
        expect(rest).toHaveLength(0);
        expect(fault.openings).toHaveLength(1);
        expect(fault.state).toBe('RESOLVED');
      }
    });

    it('is deterministic even if the same fuse is given two phases at one instant', () => {
      const events = [set(1, 'N-X1', 'S', at(0)), set(1, 'N-X1', 'R', at(0))];
      const [fault] = groupFuseFaults(events, WINDOW);
      expect(groupFuseFaults([...events].reverse(), WINDOW)).toEqual([fault]);
      expect(fault.openings.map((o) => o.phase)).toEqual(['R']);
    });

    it('returns the faults oldest first, ties by fuse set', () => {
      const faults = groupFuseFaults(
        [R(at(10), 2), R(at(0), 3), R(at(10), 1)],
        WINDOW,
      );
      expect(faults.map((f) => f.fusesSetId)).toEqual([3, 1, 2]);
    });

    it('throws for an invalid date', () => {
      expect(() =>
        groupFuseFaults([R(new Date('not a date'))], WINDOW),
      ).toThrow(RangeError);
    });

    it('does not mutate the events nor share their dates with the result', () => {
      const events = [S(at(1)), R(at(0)), clear(1, 'N-R1', 'R', at(2))];
      const snapshot = JSON.stringify(events);
      const order = [...events];

      const faults = groupFuseFaults(events, WINDOW);

      expect(events).toEqual(order);
      expect(JSON.stringify(events)).toBe(snapshot);
      for (const event of events) {
        for (const fault of faults) {
          expect(fault.startedAt).not.toBe(event.at);
          for (const opening of fault.openings) {
            expect(opening.openedAt).not.toBe(event.at);
          }
        }
      }
    });
  });
});
