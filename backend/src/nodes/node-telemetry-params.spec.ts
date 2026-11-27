import { BadRequestException } from '@nestjs/common';
import { DAY_MS } from '../history/history-params';
import {
  MAX_NODE_TELEMETRY_RANGE_DAYS,
  NODE_TELEMETRY_QUERY_PARAMETERS,
  parseNodeTelemetryQuery,
} from './node-telemetry-params';

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).message;
  }
  throw new Error('expected a BadRequestException');
}

describe('parseNodeTelemetryQuery (SCRUM-307 · F-75)', () => {
  it('accepts a valid window and normalizes the offset to UTC', () => {
    const window = parseNodeTelemetryQuery({
      from: '2026-10-21T00:00:00-05:00',
      to: '2026-10-22T00:00:00-05:00',
    });

    expect(window.from.toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-10-22T05:00:00.000Z');
  });

  it('allows only from and to', () => {
    expect(NODE_TELEMETRY_QUERY_PARAMETERS).toEqual(['from', 'to']);
  });

  it('requires from', () => {
    expect(
      messageOf(() => parseNodeTelemetryQuery({ to: '2026-10-22T00:00:00Z' })),
    ).toBe('from is required');
  });

  it('requires to', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({ from: '2026-10-21T00:00:00Z' }),
      ),
    ).toBe('to is required');
  });

  it('rejects an invalid instant format', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({
          from: '2026-10-21',
          to: '2026-10-22T00:00:00Z',
        }),
      ),
    ).toContain('from must be an ISO 8601 date-time with a time zone offset');
  });

  it('rejects a repeated parameter', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({
          from: ['2026-10-21T00:00:00Z', '2026-10-21T01:00:00Z'],
          to: '2026-10-22T00:00:00Z',
        }),
      ),
    ).toBe('from must be given only once');
  });

  it('rejects an unknown parameter and lists the allowed ones', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({
          from: '2026-10-21T00:00:00Z',
          to: '2026-10-22T00:00:00Z',
          node: 'n1',
        }),
      ),
    ).toBe('Unknown query parameter "node". Allowed parameters: from, to');
  });

  it('pluralizes and caps the unknown names it quotes', () => {
    const query: Record<string, string> = {};
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) query[key] = '1';
    query.long = 'x';
    const message = messageOf(() => parseNodeTelemetryQuery(query));

    expect(message).toBe(
      'Unknown query parameters "a", "b", "c", "d", "e", …. Allowed parameters: from, to',
    );
    expect(
      messageOf(() => parseNodeTelemetryQuery({ ['x'.repeat(100)]: '1' })),
    ).toContain(`"${'x'.repeat(64)}"`);
  });

  it('rejects from equal to to', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({
          from: '2026-10-21T00:00:00Z',
          to: '2026-10-21T00:00:00Z',
        }),
      ),
    ).toBe('from must be earlier than to');
  });

  it('rejects from later than to', () => {
    expect(
      messageOf(() =>
        parseNodeTelemetryQuery({
          from: '2026-10-22T00:00:00Z',
          to: '2026-10-21T00:00:00Z',
        }),
      ),
    ).toBe('from must be earlier than to');
  });

  it('accepts a window of exactly 31 days', () => {
    const from = '2026-10-01T00:00:00.000Z';
    const to = new Date(
      Date.parse(from) + MAX_NODE_TELEMETRY_RANGE_DAYS * DAY_MS,
    ).toISOString();

    const window = parseNodeTelemetryQuery({ from, to });

    expect(window.to.getTime() - window.from.getTime()).toBe(31 * DAY_MS);
  });

  it('rejects a window of 31 days plus 1 ms', () => {
    const from = '2026-10-01T00:00:00.000Z';
    const to = new Date(
      Date.parse(from) + MAX_NODE_TELEMETRY_RANGE_DAYS * DAY_MS + 1,
    ).toISOString();

    expect(messageOf(() => parseNodeTelemetryQuery({ from, to }))).toBe(
      'The range between from and to must not exceed 31 days',
    );
  });

  it('accepts Bogota midnight 1 June to 1 July 2026 (30 days)', () => {
    const window = parseNodeTelemetryQuery({
      from: '2026-06-01T00:00:00-05:00',
      to: '2026-07-01T00:00:00-05:00',
    });

    expect(window.from.toISOString()).toBe('2026-06-01T05:00:00.000Z');
    expect(window.to.getTime() - window.from.getTime()).toBe(30 * DAY_MS);
  });
});
