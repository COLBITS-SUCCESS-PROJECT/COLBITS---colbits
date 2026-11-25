import { BadRequestException } from '@nestjs/common';

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): request parsing and validation of GET /history.
 *
 * Pure functions, no Nest DI and no database: every 400 is decided here, before the scope is read.
 * The range is a half-open instant interval [from, to); the bucket interval (day or week) is not a
 * request parameter: it is derived from the range length (autoInterval). Filters are repeatable
 * multi-select ids/names; their union is resolved against the user scope by HistoryService.
 *
 * Only the parameters in HISTORY_QUERY_PARAMETERS are accepted. Any other key is a 400, so a
 * misspelled or differently serialized filter (node_id, circuit_id[], circuit_id[0]) can never be
 * dropped silently and widen the answer to the whole scope. This applies to GET /history only.
 */

export const HISTORY_INTERVALS = ['day', 'week'] as const;
export type HistoryInterval = (typeof HISTORY_INTERVALS)[number];

export const HISTORY_FILTER_TYPES = [
  'zone',
  'substation',
  'circuit',
  'node',
] as const;
export type HistoryFilterType = (typeof HISTORY_FILTER_TYPES)[number];

export const MAX_RANGE_DAYS = 366;
export const AUTO_DAY_INTERVAL_MAX_DAYS = 62;
export const MAX_SELECTED_ELEMENTS = 100;
export const MAX_NODE_NAME_LENGTH = 64;
export const DAY_MS = 86_400_000;

const MAX_INT4 = 2_147_483_647;
const MINUTE_MS = 60_000;

export interface HistorySelection {
  /** De-duplicated, in request order. */
  zoneIds: number[];
  substationIds: number[];
  circuitIds: number[];
  nodes: string[];
}

export interface HistoryQuery {
  from: Date;
  to: Date;
  interval: HistoryInterval;
  selection: HistorySelection;
}

/** The query parameters GET /history accepts; any other key is rejected with 400. */
export const HISTORY_QUERY_PARAMETERS = [
  'from',
  'to',
  'zone_id',
  'substation_id',
  'circuit_id',
  'node',
] as const;

/** At most this many unknown names are quoted in the 400 message, each cut to this length. */
const MAX_REPORTED_UNKNOWN = 5;
const MAX_REPORTED_NAME_LENGTH = 64;

/**
 * The whole query object as Express parses it (node:querystring: string or string[] values, keys
 * exactly as sent, so `circuit_id[]` stays a key of its own).
 */
export type RawHistoryQuery = Readonly<Record<string, unknown>>;

const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

const ID_PATTERN = /^[1-9][0-9]*$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Strict ISO 8601 instant with a time zone offset. Date.parse is deliberately not used: it is
 * lenient (2026-02-30 rolls over, T24:00 is accepted), so every field is checked here.
 */
export function parseInstant(name: 'from' | 'to', raw: unknown): Date {
  if (raw === undefined || raw === '') {
    throw new BadRequestException(`${name} is required`);
  }
  if (Array.isArray(raw)) {
    throw new BadRequestException(`${name} must be given only once`);
  }

  const invalid = new BadRequestException(
    `${name} must be an ISO 8601 date-time with a time zone offset, for example 2026-10-21T00:00:00-05:00`,
  );
  if (typeof raw !== 'string') throw invalid;

  const match = INSTANT_PATTERN.exec(raw);
  if (!match) throw invalid;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const millis = match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0'));
  const offset = match[8];

  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw invalid;
  }

  let offsetMs = 0;
  if (offset !== 'Z') {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    if (
      offsetHours > 14 ||
      offsetMinutes > 59 ||
      (offsetHours === 14 && offsetMinutes !== 0)
    ) {
      throw invalid;
    }
    const sign = offset.startsWith('-') ? -1 : 1;
    offsetMs = sign * (offsetHours * 60 + offsetMinutes) * MINUTE_MS;
  }

  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMs,
  );
}

/** Repeatable positive int4 ids; de-duplicated keeping the first occurrence. */
export function parseIdList(
  name: 'zone_id' | 'substation_id' | 'circuit_id',
  raw: unknown,
): number[] {
  if (raw === undefined) return [];

  const values: unknown[] = Array.isArray(raw) ? raw : [raw];
  const ids: number[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      throw new BadRequestException(`${name} must be a positive integer id`);
    }
    const id = Number(value);
    if (id > MAX_INT4) {
      throw new BadRequestException(`${name} must be a positive integer id`);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Repeatable node names, used exactly as given (no trim, case-sensitive); de-duplicated. */
export function parseNodeList(raw: unknown): string[] {
  if (raw === undefined) return [];

  const values: unknown[] = Array.isArray(raw) ? raw : [raw];
  const nodes: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new BadRequestException('node must be a node name');
    }
    if (value === '') {
      throw new BadRequestException('node must not be empty');
    }
    if (value.length > MAX_NODE_NAME_LENGTH) {
      throw new BadRequestException(
        `node must be at most ${MAX_NODE_NAME_LENGTH} characters`,
      );
    }
    if (!nodes.includes(value)) nodes.push(value);
  }
  return nodes;
}

/** `day` when the range is at most 62 days (inclusive), otherwise `week`. */
export function autoInterval(from: Date, to: Date): HistoryInterval {
  return to.getTime() - from.getTime() <= AUTO_DAY_INTERVAL_MAX_DAYS * DAY_MS
    ? 'day'
    : 'week';
}

export function selectionSize(selection: HistorySelection): number {
  return (
    selection.zoneIds.length +
    selection.substationIds.length +
    selection.circuitIds.length +
    selection.nodes.length
  );
}

export function isEmptySelection(selection: HistorySelection): boolean {
  return selectionSize(selection) === 0;
}

/** 400 when the query holds any key other than HISTORY_QUERY_PARAMETERS (checked before anything else). */
export function assertKnownParameters(raw: RawHistoryQuery): void {
  const allowed: readonly string[] = HISTORY_QUERY_PARAMETERS;
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;

  const quoted = unknown
    .slice(0, MAX_REPORTED_UNKNOWN)
    .map((key) => JSON.stringify(key.slice(0, MAX_REPORTED_NAME_LENGTH)));
  if (unknown.length > MAX_REPORTED_UNKNOWN) quoted.push('…');
  throw new BadRequestException(
    `Unknown query parameter${unknown.length === 1 ? '' : 's'} ${quoted.join(', ')}. Allowed parameters: ${HISTORY_QUERY_PARAMETERS.join(', ')}`,
  );
}

export function parseHistoryQuery(raw: RawHistoryQuery): HistoryQuery {
  assertKnownParameters(raw);
  const from = parseInstant('from', raw.from);
  const to = parseInstant('to', raw.to);

  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('from must be earlier than to');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(
      `The range between from and to must not exceed ${MAX_RANGE_DAYS} days`,
    );
  }

  const selection: HistorySelection = {
    zoneIds: parseIdList('zone_id', raw.zone_id),
    substationIds: parseIdList('substation_id', raw.substation_id),
    circuitIds: parseIdList('circuit_id', raw.circuit_id),
    nodes: parseNodeList(raw.node),
  };
  if (selectionSize(selection) > MAX_SELECTED_ELEMENTS) {
    throw new BadRequestException(
      `At most ${MAX_SELECTED_ELEMENTS} scope elements can be selected`,
    );
  }

  return { from, to, interval: autoInterval(from, to), selection };
}
