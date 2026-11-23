import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { ScopeContext } from '../scope/scope.types';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

const SCOPE: ScopeContext = { kind: 'restricted', userId: 2 };
const RESPONSE = {
  generated_at: '2026-11-20T15:20:00.000Z',
  from: '2026-10-21T05:00:00.000Z',
  to: '2026-11-20T05:00:00.000Z',
  timezone: 'America/Bogota',
  interval: 'day',
  filters: [],
  fuse_grouping_window_minutes: 5,
  totals: { fuse_faults: 0, voltage_alarms: 0 },
  series: [],
};
const FROM = '2026-10-21T00:00:00-05:00';
const TO = '2026-11-20T00:00:00-05:00';

function controllerWith() {
  const scopeService = { resolve: jest.fn().mockResolvedValue(SCOPE) };
  const historyService = { history: jest.fn().mockResolvedValue(RESPONSE) };
  const controller = new HistoryController(
    historyService as unknown as HistoryService,
    scopeService as unknown as ScopeService,
  );
  return { controller, scopeService, historyService };
}

const requestFor = (user?: { sub?: unknown }) =>
  ({ user }) as unknown as Request;

describe('HistoryController (SCRUM-283 · US20 · GET /history)', () => {
  it('passes the parsed query and the resolved scope of the token user to the service', async () => {
    const { controller, scopeService, historyService } = controllerWith();

    const result = await controller.findHistory(requestFor({ sub: 2 }), {
      from: FROM,
      to: TO,
      zone_id: ['2', '1', '2'],
      substation_id: '5',
      node: ['n1', 'n2'],
    });

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(historyService.history).toHaveBeenCalledTimes(1);
    const [scope, query] = historyService.history.mock.calls[0];
    expect(scope).toBe(SCOPE);
    expect(query.from.toISOString()).toBe('2026-10-21T05:00:00.000Z');
    expect(query.to.toISOString()).toBe('2026-11-20T05:00:00.000Z');
    expect(query.interval).toBe('day');
    expect(query.selection).toEqual({
      zoneIds: [2, 1],
      substationIds: [5],
      circuitIds: [],
      nodes: ['n1', 'n2'],
    });
    expect(result).toBe(RESPONSE);
  });

  it.each([
    ['no user', undefined],
    ['no user id', {}],
    ['a text id', { sub: '2' }],
    ['a zero id', { sub: 0 }],
    ['a negative id', { sub: -1 }],
    ['a decimal id', { sub: 1.5 }],
    ['an unsafe id', { sub: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects %s with 401 and reads nothing', async (_label, user) => {
    const { controller, scopeService, historyService } = controllerWith();

    await expect(
      controller.findHistory(requestFor(user), { from: FROM, to: TO }),
    ).rejects.toThrow(UnauthorizedException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(historyService.history).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing from', { to: TO }],
    ['a missing to', { from: FROM }],
    ['from equal to to', { from: FROM, to: FROM }],
    ['a range over 366 days', { from: FROM, to: '2027-11-20T00:00:00-05:00' }],
    ['an invalid id filter', { from: FROM, to: TO, zone_id: '0' }],
    ['node_id instead of node', { from: FROM, to: TO, node_id: 'n1' }],
    ['a bracket array key', { from: FROM, to: TO, 'circuit_id[]': ['1', '2'] }],
    ['an indexed array key', { from: FROM, to: TO, 'circuit_id[0]': '1' }],
    ['an arbitrary unknown parameter', { from: FROM, to: TO, page: '2' }],
  ])(
    'rejects %s with 400 before resolving the scope',
    async (_label, rawQuery) => {
      const { controller, scopeService, historyService } = controllerWith();

      await expect(
        controller.findHistory(requestFor({ sub: 2 }), rawQuery),
      ).rejects.toThrow(BadRequestException);
      expect(scopeService.resolve).not.toHaveBeenCalled();
      expect(historyService.history).not.toHaveBeenCalled();
    },
  );

  it('keeps correctly repeated filters working', async () => {
    const { controller, historyService } = controllerWith();

    await controller.findHistory(requestFor({ sub: 2 }), {
      from: FROM,
      to: TO,
      circuit_id: ['1', '2'],
      node: ['n1', 'n2'],
    });

    const [, query] = historyService.history.mock.calls[0];
    expect(query.selection.circuitIds).toEqual([1, 2]);
    expect(query.selection.nodes).toEqual(['n1', 'n2']);
  });

  it('answers 400 before 401: the query is validated first', async () => {
    const { controller, scopeService } = controllerWith();

    await expect(
      controller.findHistory(requestFor(undefined), {}),
    ).rejects.toThrow(BadRequestException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
  });

  it('is protected by the authentication guard', () => {
    const handler = (
      HistoryController.prototype as unknown as Record<string, object>
    )['findHistory'];
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards.map((guard) => (guard as { name: string }).name)).toContain(
      'AuthGuard',
    );
  });
});
