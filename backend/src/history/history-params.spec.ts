import { BadRequestException } from '@nestjs/common';
import {
  DAY_MS,
  HISTORY_QUERY_PARAMETERS,
  assertKnownParameters,
  autoInterval,
  isEmptySelection,
  parseHistoryQuery,
  parseIdList,
  parseInstant,
  parseNodeList,
  selectionSize,
} from './history-params';

const INSTANT_MESSAGE = (name: string) =>
  `${name} must be an ISO 8601 date-time with a time zone offset, for example 2026-10-21T00:00:00-05:00`;

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected a BadRequestException');
}

describe('parseInstant (SCRUM-283 · US20)', () => {
  it.each([
    ['Z', '2026-10-21T05:00:00Z', Date.UTC(2026, 9, 21, 5)],
    ['-05:00', '2026-10-21T00:00:00-05:00', Date.UTC(2026, 9, 21, 5)],
    ['+00:00', '2026-10-21T05:00:00+00:00', Date.UTC(2026, 9, 21, 5)],
    ['-00:00', '2026-10-21T05:00:00-00:00', Date.UTC(2026, 9, 21, 5)],
    ['+05:30', '2026-10-21T10:30:00+05:30', Date.UTC(2026, 9, 21, 5)],
    ['no seconds', '2026-10-21T00:00-05:00', Date.UTC(2026, 9, 21, 5)],
    ['seconds', '2026-10-21T00:00:07-05:00', Date.UTC(2026, 9, 21, 5, 0, 7)],
    [
      '1 fractional digit',
      '2026-10-21T00:00:00.5Z',
      Date.UTC(2026, 9, 21, 0, 0, 0, 500),
    ],
    [
      '2 fractional digits',
      '2026-10-21T00:00:00.25Z',
      Date.UTC(2026, 9, 21, 0, 0, 0, 250),
    ],
    [
      '3 fractional digits',
      '2026-10-21T00:00:00.007Z',
      Date.UTC(2026, 9, 21, 0, 0, 0, 7),
    ],
    ['offset +14:00', '2026-10-21T14:00:00+14:00', Date.UTC(2026, 9, 21)],
    ['year 1970', '1970-01-01T00:00:00Z', 0],
    ['leap day 2024', '2024-02-29T00:00:00Z', Date.UTC(2024, 1, 29)],
    ['leap day 2000', '2000-02-29T00:00:00Z', Date.UTC(2000, 1, 29)],
    ['last second', '2026-12-31T23:59:59Z', Date.UTC(2026, 11, 31, 23, 59, 59)],
  ])('accepts %s', (_label, raw, epoch) => {
    expect(parseInstant('from', raw).getTime()).toBe(epoch);
  });

  it('reports a missing or empty value as required', () => {
    expect(messageOf(() => parseInstant('from', undefined))).toBe(
      'from is required',
    );
    expect(messageOf(() => parseInstant('to', ''))).toBe('to is required');
  });

  it('rejects a repeated parameter', () => {
    expect(messageOf(() => parseInstant('from', ['a', 'b']))).toBe(
      'from must be given only once',
    );
    expect(messageOf(() => parseInstant('to', []))).toBe(
      'to must be given only once',
    );
  });

  it.each([
    ['a number', 1_761_000_000_000],
    ['an object', {}],
    ['a date-only value', '2026-10-21'],
    ['a value with no offset', '2026-10-21T00:00:00'],
    ['an offset without a colon', '2026-10-21T00:00:00+0500'],
    ['an offset with only hours', '2026-10-21T00:00:00-05'],
    ['a space instead of T', '2026-10-21 00:00:00Z'],
    ['a lowercase t', '2026-10-21t00:00:00Z'],
    ['a lowercase z', '2026-10-21T00:00:00z'],
    ['a surrounding space', ' 2026-10-21T00:00:00Z'],
    ['hour only', '2026-10-21T00Z'],
    ['February 30', '2026-02-30T00:00:00Z'],
    ['February 29 of a non-leap year', '2025-02-29T00:00:00Z'],
    ['February 29 of 2100 (not a leap year)', '2100-02-29T00:00:00Z'],
    ['April 31', '2026-04-31T00:00:00Z'],
    ['month 13', '2026-13-01T00:00:00Z'],
    ['month 0', '2026-00-01T00:00:00Z'],
    ['day 0', '2026-10-00T00:00:00Z'],
    ['T24:00', '2026-10-21T24:00:00Z'],
    ['60 minutes', '2026-10-21T00:60:00Z'],
    ['60 seconds', '2026-10-21T00:00:60Z'],
    ['4 fractional digits', '2026-10-21T00:00:00.1234Z'],
    ['a fraction without digits', '2026-10-21T00:00:00.Z'],
    ['a fraction without seconds', '2026-10-21T00:00.5Z'],
    ['offset +15:00', '2026-10-21T00:00:00+15:00'],
    ['offset +14:30', '2026-10-21T00:00:00+14:30'],
    ['offset minutes 60', '2026-10-21T00:00:00+05:60'],
    ['year 1969', '1969-12-31T23:59:59Z'],
  ])('rejects %s', (_label, raw) => {
    expect(messageOf(() => parseInstant('from', raw))).toBe(
      INSTANT_MESSAGE('from'),
    );
  });

  it('names the parameter in the message', () => {
    expect(messageOf(() => parseInstant('to', 'nope'))).toBe(
      INSTANT_MESSAGE('to'),
    );
  });
});

describe('parseIdList', () => {
  it('returns no ids when the parameter is absent', () => {
    expect(parseIdList('zone_id', undefined)).toEqual([]);
  });

  it('accepts one value, an array and the largest int4', () => {
    expect(parseIdList('zone_id', '1')).toEqual([1]);
    expect(parseIdList('circuit_id', ['3', '1', '2'])).toEqual([3, 1, 2]);
    expect(parseIdList('substation_id', '2147483647')).toEqual([2147483647]);
  });

  it('de-duplicates keeping the first occurrence order', () => {
    expect(parseIdList('zone_id', ['2', '1', '2', '3', '1'])).toEqual([
      2, 1, 3,
    ]);
  });

  it.each([
    ['zero', '0'],
    ['a leading zero', '01'],
    ['a negative id', '-1'],
    ['a decimal', '1.5'],
    ['text', 'abc'],
    ['an empty string', ''],
    ['a padded value', ' 1'],
    ['a value above int4', '2147483648'],
    ['a huge value', '9'.repeat(400)],
    ['a non-string value', 1],
    ['an object', {}],
  ])('rejects %s', (_label, raw) => {
    expect(messageOf(() => parseIdList('circuit_id', raw))).toBe(
      'circuit_id must be a positive integer id',
    );
  });

  it('rejects one bad value among valid ones, naming the parameter', () => {
    expect(messageOf(() => parseIdList('zone_id', ['1', 'x']))).toBe(
      'zone_id must be a positive integer id',
    );
  });
});

describe('parseNodeList', () => {
  it('returns no nodes when the parameter is absent', () => {
    expect(parseNodeList(undefined)).toEqual([]);
  });

  it('uses the names exactly as given (no trim, case-sensitive)', () => {
    expect(parseNodeList('0000100002')).toEqual(['0000100002']);
    expect(parseNodeList([' a ', 'A', 'a'])).toEqual([' a ', 'A', 'a']);
  });

  it('de-duplicates keeping the first occurrence order', () => {
    expect(parseNodeList(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('accepts a name of exactly 64 characters', () => {
    expect(parseNodeList('n'.repeat(64))).toEqual(['n'.repeat(64)]);
  });

  it('rejects empty and over-long names', () => {
    expect(messageOf(() => parseNodeList(''))).toBe('node must not be empty');
    expect(messageOf(() => parseNodeList(['a', '']))).toBe(
      'node must not be empty',
    );
    expect(messageOf(() => parseNodeList('n'.repeat(65)))).toBe(
      'node must be at most 64 characters',
    );
  });

  it('rejects values that are not strings', () => {
    expect(messageOf(() => parseNodeList(5))).toBe('node must be a node name');
    expect(messageOf(() => parseNodeList(['a', 5]))).toBe(
      'node must be a node name',
    );
  });
});

describe('autoInterval', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');

  it('is day up to and including 62 days', () => {
    expect(autoInterval(from, new Date(from.getTime() + DAY_MS))).toBe('day');
    expect(autoInterval(from, new Date(from.getTime() + 62 * DAY_MS))).toBe(
      'day',
    );
  });

  it('is week from 62 days plus 1 ms', () => {
    expect(autoInterval(from, new Date(from.getTime() + 62 * DAY_MS + 1))).toBe(
      'week',
    );
    expect(autoInterval(from, new Date(from.getTime() + 366 * DAY_MS))).toBe(
      'week',
    );
  });
});

describe('selection helpers', () => {
  it('counts every selected element', () => {
    const selection = {
      zoneIds: [1],
      substationIds: [2, 3],
      circuitIds: [],
      nodes: ['a'],
    };

    expect(selectionSize(selection)).toBe(4);
    expect(isEmptySelection(selection)).toBe(false);
    expect(
      isEmptySelection({
        zoneIds: [],
        substationIds: [],
        circuitIds: [],
        nodes: [],
      }),
    ).toBe(true);
  });
});

describe('assertKnownParameters (strict query of GET /history)', () => {
  const FROM = '2026-10-21T00:00:00-05:00';
  const TO = '2026-11-20T00:00:00-05:00';
  const ALLOWED =
    'Allowed parameters: from, to, zone_id, substation_id, circuit_id, node';

  /** node:querystring (Express 5's "simple" parser) returns objects without a prototype. */
  const parsed = (entries: Record<string, unknown>) =>
    Object.assign(Object.create(null) as Record<string, unknown>, entries);

  it('accepts exactly the six documented parameters', () => {
    expect(HISTORY_QUERY_PARAMETERS).toEqual([
      'from',
      'to',
      'zone_id',
      'substation_id',
      'circuit_id',
      'node',
    ]);
    expect(() =>
      assertKnownParameters(
        parsed({
          from: FROM,
          to: TO,
          zone_id: ['1', '2'],
          substation_id: '3',
          circuit_id: ['4', '5'],
          node: ['a', 'b'],
        }),
      ),
    ).not.toThrow();
    expect(() => assertKnownParameters(parsed({}))).not.toThrow();
  });

  it.each([
    ['node_id (the name used by another endpoint)', 'node_id'],
    ['a bracket array key', 'circuit_id[]'],
    ['an indexed array key', 'circuit_id[0]'],
    ['a different case', 'Circuit_ID'],
    ['an arbitrary parameter', 'page'],
    ['an empty key', ''],
    ['__proto__', '__proto__'],
  ])('rejects %s', (_label, key) => {
    expect(
      messageOf(() =>
        assertKnownParameters(parsed({ from: FROM, to: TO, [key]: '1' })),
      ),
    ).toBe(`Unknown query parameter ${JSON.stringify(key)}. ${ALLOWED}`);
  });

  it('rejects an unknown key even when its value is empty', () => {
    expect(() => assertKnownParameters(parsed({ page: '' }))).toThrow(
      BadRequestException,
    );
  });

  it('lists several unknown names, at most five, each cut to 64 characters', () => {
    expect(
      messageOf(() => assertKnownParameters(parsed({ a: '1', b: '2' }))),
    ).toBe(`Unknown query parameters "a", "b". ${ALLOWED}`);

    const many = Object.fromEntries(
      ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((key) => [key, '1']),
    );
    expect(messageOf(() => assertKnownParameters(parsed(many)))).toBe(
      `Unknown query parameters "k1", "k2", "k3", "k4", "k5", …. ${ALLOWED}`,
    );

    const long = 'x'.repeat(100);
    expect(
      messageOf(() => assertKnownParameters(parsed({ [long]: '1' }))),
    ).toBe(`Unknown query parameter "${'x'.repeat(64)}". ${ALLOWED}`);
  });
});

describe('parseHistoryQuery', () => {
  const FROM = '2026-10-21T00:00:00-05:00';
  const TO = '2026-11-20T00:00:00-05:00';

  it('parses a range with no filters', () => {
    const query = parseHistoryQuery({ from: FROM, to: TO });

    expect(query.from.toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(query.to.toISOString()).toBe('2026-11-20T05:00:00.000Z');
    expect(query.interval).toBe('day');
    expect(query.selection).toEqual({
      zoneIds: [],
      substationIds: [],
      circuitIds: [],
      nodes: [],
    });
  });

  it('parses mixed, repeated filters, de-duplicated', () => {
    const query = parseHistoryQuery({
      from: FROM,
      to: TO,
      zone_id: ['2', '1', '2'],
      substation_id: '5',
      circuit_id: ['7', '8'],
      node: ['n1', 'n1', 'n2'],
    });

    expect(query.selection).toEqual({
      zoneIds: [2, 1],
      substationIds: [5],
      circuitIds: [7, 8],
      nodes: ['n1', 'n2'],
    });
  });

  it('rejects an unknown parameter before checking anything else', () => {
    expect(messageOf(() => parseHistoryQuery({ node_id: 'n1' }))).toBe(
      'Unknown query parameter "node_id". Allowed parameters: from, to, zone_id, substation_id, circuit_id, node',
    );
  });

  it('reports from before to, and checks from first', () => {
    expect(messageOf(() => parseHistoryQuery({}))).toBe('from is required');
    expect(messageOf(() => parseHistoryQuery({ from: FROM }))).toBe(
      'to is required',
    );
    expect(messageOf(() => parseHistoryQuery({ from: 'x', to: TO }))).toBe(
      INSTANT_MESSAGE('from'),
    );
  });

  it('rejects from equal to and from after to', () => {
    expect(messageOf(() => parseHistoryQuery({ from: FROM, to: FROM }))).toBe(
      'from must be earlier than to',
    );
    expect(messageOf(() => parseHistoryQuery({ from: TO, to: FROM }))).toBe(
      'from must be earlier than to',
    );
  });

  it('accepts exactly 366 days and rejects 1 ms more', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const limit = new Date(Date.parse(from) + 366 * DAY_MS);

    const query = parseHistoryQuery({ from, to: limit.toISOString() });
    expect(query.interval).toBe('week');

    expect(
      messageOf(() =>
        parseHistoryQuery({
          from,
          to: new Date(limit.getTime() + 1).toISOString(),
        }),
      ),
    ).toBe('The range between from and to must not exceed 366 days');
  });

  it('chooses day for 62 days and week for 62 days plus 1 ms', () => {
    const from = '2026-01-01T00:00:00.000Z';
    const edge = Date.parse(from) + 62 * DAY_MS;

    expect(
      parseHistoryQuery({ from, to: new Date(edge).toISOString() }).interval,
    ).toBe('day');
    expect(
      parseHistoryQuery({ from, to: new Date(edge + 1).toISOString() })
        .interval,
    ).toBe('week');
  });

  it('validates the filters after the range', () => {
    expect(
      messageOf(() => parseHistoryQuery({ from: FROM, to: TO, zone_id: '0' })),
    ).toBe('zone_id must be a positive integer id');
    expect(
      messageOf(() => parseHistoryQuery({ from: FROM, to: TO, node: '' })),
    ).toBe('node must not be empty');
    expect(
      messageOf(() => parseHistoryQuery({ from: TO, to: FROM, zone_id: '0' })),
    ).toBe('from must be earlier than to');
  });

  it('accepts 100 selected elements and rejects 101 (mixed types)', () => {
    const ids = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) => String(index + 1 + offset));
    const base = { from: FROM, to: TO };

    const hundred = parseHistoryQuery({
      ...base,
      zone_id: ids(40, 0),
      substation_id: ids(30, 0),
      circuit_id: ids(20, 0),
      node: ids(10, 0).map((id) => `node-${id}`),
    });
    expect(selectionSize(hundred.selection)).toBe(100);

    expect(
      messageOf(() =>
        parseHistoryQuery({
          ...base,
          zone_id: ids(40, 0),
          substation_id: ids(30, 0),
          circuit_id: ids(20, 0),
          node: ids(11, 0).map((id) => `node-${id}`),
        }),
      ),
    ).toBe('At most 100 scope elements can be selected');
  });

  it('counts only distinct elements towards the limit', () => {
    const repeated = Array.from({ length: 150 }, () => '1');

    expect(
      selectionSize(
        parseHistoryQuery({ from: FROM, to: TO, zone_id: repeated }).selection,
      ),
    ).toBe(1);
  });
});
