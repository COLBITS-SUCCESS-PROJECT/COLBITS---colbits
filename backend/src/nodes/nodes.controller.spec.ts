import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { ScopeContext } from '../scope/scope.types';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

const SCOPE: ScopeContext = { kind: 'restricted', userId: 2 };
const RESPONSE = { count: 0, nodes: [] };

function controllerWith() {
  const scopeService = { resolve: jest.fn().mockResolvedValue(SCOPE) };
  const nodesService = { findAll: jest.fn().mockResolvedValue(RESPONSE) };
  const controller = new NodesController(
    nodesService as unknown as NodesService,
    scopeService as unknown as ScopeService,
  );
  return { controller, scopeService, nodesService };
}

const requestFor = (user?: { sub?: unknown }) =>
  ({ user }) as unknown as Request;

describe('NodesController (US3 + US4)', () => {
  it('returns the nodes inside the scope of the user in the token (F-10)', async () => {
    const { controller, scopeService, nodesService } = controllerWith();

    const result = await controller.findAll(requestFor({ sub: 2 }));

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(nodesService.findAll).toHaveBeenCalledWith(SCOPE);
    expect(result).toBe(RESPONSE);
  });

  it.each([
    ['no user', undefined],
    ['no user id', {}],
    ['a text id', { sub: '2' }],
    ['a zero id', { sub: 0 }],
    ['a decimal id', { sub: 1.5 }],
  ])('rejects a request with %s and queries nothing', async (_case, user) => {
    const { controller, scopeService, nodesService } = controllerWith();

    await expect(controller.findAll(requestFor(user))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(nodesService.findAll).not.toHaveBeenCalled();
  });
});
