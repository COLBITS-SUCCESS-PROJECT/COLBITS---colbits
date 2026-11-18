import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { ScopeContext } from '../scope/scope.types';
import { ActiveFaultsService } from './active-faults.service';
import { FaultsController } from './faults.controller';

const SCOPE: ScopeContext = { kind: 'restricted', userId: 2 };
const RESPONSE = {
  generated_at: '2026-10-29T15:20:00.000Z',
  count: 0,
  counters: {
    fuseAlarmNodes: 0,
    voltageAlarmNodes: 0,
    phaseOutOfRangeNodes: 0,
    phaseDroppedNodes: 0,
  },
  faults: [],
};

function controllerWith() {
  const scopeService = { resolve: jest.fn().mockResolvedValue(SCOPE) };
  const activeFaultsService = {
    activeFaults: jest.fn().mockResolvedValue(RESPONSE),
    resolvedFaults: jest.fn().mockResolvedValue(RESPONSE),
  };
  const controller = new FaultsController(
    activeFaultsService as unknown as ActiveFaultsService,
    scopeService as unknown as ScopeService,
  );
  return { controller, scopeService, activeFaultsService };
}

const requestFor = (user?: { sub?: unknown }) =>
  ({ user }) as unknown as Request;

describe('FaultsController (US10 · GET /faults & US16 · GET /faults/resolved)', () => {
  it('returns the active faults inside the scope of the user in the token (F-10)', async () => {
    const { controller, scopeService, activeFaultsService } = controllerWith();

    const result = await controller.findActive(requestFor({ sub: 2 }));

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(activeFaultsService.activeFaults).toHaveBeenCalledWith(SCOPE);
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
    const { controller, scopeService, activeFaultsService } = controllerWith();

    await expect(controller.findActive(requestFor(user))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(activeFaultsService.activeFaults).not.toHaveBeenCalled();
  });

  it('is protected by the authentication guard', () => {
    const handler = (
      FaultsController.prototype as unknown as Record<string, object>
    )['findActive'];
    const guards: unknown[] = Reflect.getMetadata('__guards__', handler) ?? [];

    expect(guards.map((guard) => (guard as { name: string }).name)).toContain(
      'AuthGuard',
    );
  });

  describe('GET /faults/resolved (US16 · F-62)', () => {
    it('defaults to the 24h window when no window query parameter is passed', async () => {
      const { controller, scopeService, activeFaultsService } = controllerWith();

      const result = await controller.findResolved(requestFor({ sub: 2 }));

      expect(scopeService.resolve).toHaveBeenCalledWith(2);
      expect(activeFaultsService.resolvedFaults).toHaveBeenCalledWith(
        SCOPE,
        '24h',
      );
      expect(result).toBe(RESPONSE);
    });

    it.each(['1h', '24h', '1d'] as const)(
      'forwards the %s window to ActiveFaultsService.resolvedFaults',
      async (window) => {
        const { controller, activeFaultsService } = controllerWith();

        await controller.findResolved(requestFor({ sub: 2 }), window);

        expect(activeFaultsService.resolvedFaults).toHaveBeenCalledWith(
          SCOPE,
          window,
        );
      },
    );

    it('rejects unsupported window values with 400 BadRequestException', async () => {
      const { controller, scopeService, activeFaultsService } = controllerWith();

      await expect(
        controller.findResolved(requestFor({ sub: 2 }), '7d'),
      ).rejects.toThrow(BadRequestException);
      expect(scopeService.resolve).not.toHaveBeenCalled();
      expect(activeFaultsService.resolvedFaults).not.toHaveBeenCalled();
    });

    it('is protected by the authentication guard', () => {
      const handler = (
        FaultsController.prototype as unknown as Record<string, object>
      )['findResolved'];
      const guards: unknown[] =
        Reflect.getMetadata('__guards__', handler) ?? [];

      expect(guards.map((guard) => (guard as { name: string }).name)).toContain(
        'AuthGuard',
      );
    });
  });
});
