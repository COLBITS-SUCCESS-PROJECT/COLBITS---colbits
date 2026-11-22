import {
  compareFaultOrder,
  FaultOrderKey,
  orderFaults,
} from './fault-ordering';

const T0 = Date.UTC(2026, 10, 11, 10, 0, 0);
const at = (minutes: number): string =>
  new Date(T0 + minutes * 60_000).toISOString();

/** A fuse-opening fault unless overridden. */
function fault(overrides: Partial<FaultOrderKey> = {}): FaultOrderKey {
  return {
    id: 'F',
    alert_type: 'FUSE_OPENING',
    fuses_set_id: 1,
    source_id: null,
    channel: null,
    client_count: 50,
    started_at: at(0),
    ...overrides,
  };
}

const ids = (faults: FaultOrderKey[]): string[] =>
  faults.map((entry) => entry.id);

/** Every ordering of the input, so no result can depend on the position of an entry. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe('fault ordering (F-57)', () => {
  describe('acceptance example: 200, 50 and 50 affected clients', () => {
    const f200 = fault({ id: 'f200', client_count: 200, started_at: at(30) });
    const f50old = fault({
      id: 'f50old',
      fuses_set_id: 2,
      client_count: 50,
      started_at: at(5),
    });
    const f50new = fault({
      id: 'f50new',
      fuses_set_id: 3,
      client_count: 50,
      started_at: at(20),
    });

    it('lists the 200-client fault first, then the two 50-client faults oldest first', () => {
      expect(ids(orderFaults([f50new, f50old, f200]))).toEqual([
        'f200',
        'f50old',
        'f50new',
      ]);
    });

    it('gives the same result for every input order', () => {
      for (const input of permutations([f200, f50old, f50new])) {
        expect(ids(orderFaults(input))).toEqual(['f200', 'f50old', 'f50new']);
      }
    });
  });

  describe('severity and age', () => {
    it('puts more affected clients first, even when that fault is newer', () => {
      const older = fault({ id: 'older', client_count: 10, started_at: at(0) });
      const newer = fault({
        id: 'newer',
        fuses_set_id: 2,
        client_count: 11,
        started_at: at(60),
      });

      expect(ids(orderFaults([older, newer]))).toEqual(['newer', 'older']);
    });

    it('puts the older fault first when the client counts are equal', () => {
      const older = fault({ id: 'older', started_at: at(0) });
      const newer = fault({ id: 'newer', fuses_set_id: 2, started_at: at(1) });

      expect(ids(orderFaults([newer, older]))).toEqual(['older', 'newer']);
    });

    it('compares instants, not text, so offsets and fractions cannot reorder them', () => {
      const earlier = fault({
        id: 'earlier',
        started_at: '2026-11-11T10:00:00.250+00:00',
      });
      const later = fault({
        id: 'later',
        fuses_set_id: 2,
        started_at: '2026-11-11T10:00:00.900Z',
      });
      const sameInstantOtherOffset = fault({
        id: 'offset',
        fuses_set_id: 3,
        started_at: '2026-11-11T05:00:00.250-05:00', // the same instant as `earlier`
      });

      expect(
        ids(orderFaults([later, sameInstantOtherOffset, earlier])),
      ).toEqual(['earlier', 'offset', 'later']);
    });
  });

  describe('unknown client count (provisional: sorts as 0)', () => {
    it('ranks a known count above an unknown one', () => {
      const unknown = fault({
        id: 'unknown',
        client_count: null,
        started_at: at(0),
      });
      const one = fault({
        id: 'one',
        fuses_set_id: 2,
        client_count: 1,
        started_at: at(60),
      });

      expect(ids(orderFaults([unknown, one]))).toEqual(['one', 'unknown']);
    });

    it('ranks a known 0 and an unknown count together, by age', () => {
      const zeroOld = fault({
        id: 'zeroOld',
        client_count: 0,
        started_at: at(0),
      });
      const unknownMid = fault({
        id: 'unknownMid',
        fuses_set_id: 2,
        client_count: null,
        started_at: at(10),
      });
      const zeroNew = fault({
        id: 'zeroNew',
        fuses_set_id: 3,
        client_count: 0,
        started_at: at(20),
      });
      const unknownOld = fault({
        id: 'unknownOld',
        fuses_set_id: 4,
        client_count: null,
        started_at: at(-5),
      });

      for (const input of permutations([
        zeroOld,
        unknownMid,
        zeroNew,
        unknownOld,
      ])) {
        expect(ids(orderFaults(input))).toEqual([
          'unknownOld',
          'zeroOld',
          'unknownMid',
          'zeroNew',
        ]);
      }
    });

    it('is equal to the comparison of the same fault with 0 in place of null', () => {
      const unknown = fault({ client_count: null });
      const zero = fault({ client_count: 0 });

      expect(compareFaultOrder(unknown, zero)).toBe(0);
      expect(compareFaultOrder(zero, unknown)).toBe(0);
    });

    it('does not change the field: the input keeps its null and nothing becomes 0', () => {
      const unknown = fault({ id: 'unknown', client_count: null });

      const [ordered] = orderFaults([unknown]);

      expect(ordered).toBe(unknown);
      expect(ordered.client_count).toBeNull();
    });
  });

  describe('source alarms (client count never available)', () => {
    const noVoltage = (overrides: Partial<FaultOrderKey> = {}) =>
      fault({
        alert_type: 'NO_VOLTAGE',
        fuses_set_id: 7,
        source_id: '0000100002-A-R',
        client_count: null,
        ...overrides,
      });

    it('lists a fuse fault with clients before an older source alarm', () => {
      const alarm = noVoltage({ id: 'alarm', started_at: at(0) });
      const opening = fault({
        id: 'opening',
        client_count: 3,
        started_at: at(30),
      });

      expect(ids(orderFaults([alarm, opening]))).toEqual(['opening', 'alarm']);
    });

    it('orders source alarms among themselves, and with unknown-count fuse faults, by age', () => {
      const alarmOld = noVoltage({ id: 'alarmOld', started_at: at(0) });
      const unknownOpening = fault({
        id: 'unknownOpening',
        client_count: null,
        started_at: at(10),
      });
      const alarmNew = noVoltage({
        id: 'alarmNew',
        source_id: '0000100002-A-S',
        started_at: at(20),
      });

      for (const input of permutations([alarmNew, unknownOpening, alarmOld])) {
        expect(ids(orderFaults(input))).toEqual([
          'alarmOld',
          'unknownOpening',
          'alarmNew',
        ]);
      }
    });
  });

  describe('tie-breakers when client count and start are equal', () => {
    const smac = (
      id: string,
      alertType: string,
      source: string,
      channel: 'A' | 'B' | 'C',
    ) =>
      fault({
        id,
        alert_type: alertType as FaultOrderKey['alert_type'],
        fuses_set_id: null,
        source_id: source,
        channel,
        client_count: null,
      });
    const opening = (id: string, fusesSetId: number) =>
      fault({ id, fuses_set_id: fusesSetId });
    const entries = [
      opening('opening-1', 1),
      opening('opening-2', 2),
      opening('opening-3', 2),
      fault({
        id: 'voltage-r',
        alert_type: 'NO_VOLTAGE',
        fuses_set_id: 1,
        source_id: 'N-A-R',
        client_count: null,
      }),
      fault({
        id: 'voltage-s',
        alert_type: 'NO_VOLTAGE',
        fuses_set_id: 1,
        source_id: 'N-A-S',
        client_count: null,
      }),
      smac('loss-a', 'PHASE_LOSS', 'N-T1-3', 'A'),
      smac('loss-b', 'PHASE_LOSS', 'N-T1-3', 'B'),
      smac('range-a', 'PHASE_OUT_OF_RANGE', 'N-T1-3', 'A'),
    ];
    // The fuse openings have 50 clients, the rest none: group the ties that really are ties.
    const unknownTies = entries.filter((entry) => entry.client_count === null);
    const openingTies = entries.filter((entry) => entry.client_count === 50);

    it('orders by alert type, then source, then channel', () => {
      for (const input of permutations(unknownTies)) {
        expect(ids(orderFaults(input))).toEqual([
          'voltage-r',
          'voltage-s',
          'loss-a',
          'loss-b',
          'range-a',
        ]);
      }
    });

    it('orders fuse faults of the same instant by fuse set, then by id', () => {
      for (const input of permutations(openingTies)) {
        expect(ids(orderFaults(input))).toEqual([
          'opening-1',
          'opening-2',
          'opening-3',
        ]);
      }
    });

    it('is deterministic even when every field but the id is equal', () => {
      const a = fault({ id: 'a' });
      const b = fault({ id: 'b' });

      expect(ids(orderFaults([b, a]))).toEqual(['a', 'b']);
      expect(ids(orderFaults([a, b]))).toEqual(['a', 'b']);
      expect(compareFaultOrder(a, a)).toBe(0);
    });
  });

  describe('input handling', () => {
    it('returns a new array and leaves the input as it was', () => {
      const first = fault({ id: 'first', client_count: 1 });
      const second = fault({ id: 'second', fuses_set_id: 2, client_count: 2 });
      const input = [first, second];

      const result = orderFaults(input);

      expect(result).not.toBe(input);
      expect(ids(input)).toEqual(['first', 'second']);
      expect(ids(result)).toEqual(['second', 'first']);
    });

    it('returns an empty list for an empty input', () => {
      expect(orderFaults([])).toEqual([]);
    });
  });
});
