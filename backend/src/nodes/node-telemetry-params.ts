import { BadRequestException } from '@nestjs/common';
import { DAY_MS, parseInstant } from '../history/history-params';

/**
 * Longest window of raw node telemetry, in days. Initial technical decision (raw readings, payload
 * size), not a client requirement; pending frontend coordination.
 */
export const MAX_NODE_TELEMETRY_RANGE_DAYS = 31;

/** The query parameters the node telemetry read accepts; any other key is rejected with 400. */
export const NODE_TELEMETRY_QUERY_PARAMETERS = ['from', 'to'] as const;

/** Half-open instant interval [from, to). */
export interface NodeTelemetryWindow {
  from: Date;
  to: Date;
}

/** The whole query object as Express parses it (string or string[] values, keys as sent). */
export type RawNodeTelemetryQuery = Readonly<Record<string, unknown>>;

/** At most this many unknown names are quoted in the 400 message, each cut to this length. */
const MAX_REPORTED_UNKNOWN = 5;
const MAX_REPORTED_NAME_LENGTH = 64;

function assertKnownTelemetryParameters(raw: RawNodeTelemetryQuery): void {
  const allowed: readonly string[] = NODE_TELEMETRY_QUERY_PARAMETERS;
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;

  const quoted = unknown
    .slice(0, MAX_REPORTED_UNKNOWN)
    .map((key) => JSON.stringify(key.slice(0, MAX_REPORTED_NAME_LENGTH)));
  if (unknown.length > MAX_REPORTED_UNKNOWN) quoted.push('…');
  throw new BadRequestException(
    `Unknown query parameter${unknown.length === 1 ? '' : 's'} ${quoted.join(', ')}. Allowed parameters: ${NODE_TELEMETRY_QUERY_PARAMETERS.join(', ')}`,
  );
}

/**
 * Parses and validates the window of a node telemetry read: both instants required (ISO 8601 with
 * offset), from earlier than to, and at most MAX_NODE_TELEMETRY_RANGE_DAYS long (exactly that is
 * allowed). Pure: every 400 is decided here, before the scope is read.
 */
export function parseNodeTelemetryQuery(
  raw: RawNodeTelemetryQuery,
): NodeTelemetryWindow {
  assertKnownTelemetryParameters(raw);
  const from = parseInstant('from', raw.from);
  const to = parseInstant('to', raw.to);

  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException('from must be earlier than to');
  }
  if (to.getTime() - from.getTime() > MAX_NODE_TELEMETRY_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(
      `The range between from and to must not exceed ${MAX_NODE_TELEMETRY_RANGE_DAYS} days`,
    );
  }

  return { from, to };
}
