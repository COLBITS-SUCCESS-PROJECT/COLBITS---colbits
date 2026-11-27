import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { ScopeContext } from '../scope/scope.types';
import { NodeDetailService } from './node-detail.service';
import { NodeTelemetryService } from './node-telemetry.service';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

const SCOPE: ScopeContext = { kind: 'restricted', userId: 2 };
const RESPONSE = { count: 0, nodes: [] };
const FUSE_SETS = { node: '0000100002', fuse_sets: [] };
const DETAIL = { node: '0000100002', fuse_sets: [], transformers: [] };
const TELEMETRY = { node: '0000100002', fuse_sets: [], transformers: [] };

function controllerWith() {
  const scopeService = { resolve: jest.fn().mockResolvedValue(SCOPE) };
  const nodesService = {
    findAll: jest.fn().mockResolvedValue(RESPONSE),
    fuseSetsOf: jest.fn().mockResolvedValue(FUSE_SETS),
  };
  const nodeDetailService = {
    detailOf: jest.fn().mockResolvedValue(DETAIL),
  };
  const nodeTelemetryService = {
    telemetryOf: jest.fn().mockResolvedValue(TELEMETRY),
  };
  const controller = new NodesController(
    nodesService as unknown as NodesService,
    scopeService as unknown as ScopeService,
    nodeDetailService as unknown as NodeDetailService,
    nodeTelemetryService as unknown as NodeTelemetryService,
  );
  return {
    controller,
    scopeService,
    nodesService,
    nodeDetailService,
    nodeTelemetryService,
  };
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

describe('NodesController.findFuseSets (US11 · F-29)', () => {
  it('returns the fuse sets of the node within the scope of the user in the token', async () => {
    const { controller, scopeService, nodesService } = controllerWith();

    const result = await controller.findFuseSets(
      ' 0000100002 ',
      requestFor({ sub: 2 }),
    );

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(nodesService.fuseSetsOf).toHaveBeenCalledWith('0000100002', SCOPE);
    expect(result).toBe(FUSE_SETS);
  });

  it('rejects a request without a valid user before querying', async () => {
    const { controller, scopeService, nodesService } = controllerWith();

    await expect(
      controller.findFuseSets('0000100002', requestFor({ sub: '2' })),
    ).rejects.toThrow(UnauthorizedException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(nodesService.fuseSetsOf).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty name', '   '],
    ['an oversized name', 'x'.repeat(65)],
  ])('answers 404 for %s without querying', async (_case, name) => {
    const { controller, nodesService } = controllerWith();

    await expect(
      controller.findFuseSets(name, requestFor({ sub: 2 })),
    ).rejects.toThrow(NotFoundException);
    expect(nodesService.fuseSetsOf).not.toHaveBeenCalled();
  });
});

describe('NodesController.findDetail (US11 · F-27)', () => {
  it('returns the detail of the node within the scope of the user in the token', async () => {
    const { controller, scopeService, nodeDetailService } = controllerWith();

    const result = await controller.findDetail(
      ' 0000100002 ',
      requestFor({ sub: 2 }),
    );

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(nodeDetailService.detailOf).toHaveBeenCalledWith(
      '0000100002',
      SCOPE,
    );
    expect(result).toBe(DETAIL);
  });

  it('rejects a request without a valid user and reads nothing', async () => {
    const { controller, scopeService, nodeDetailService } = controllerWith();

    await expect(
      controller.findDetail('0000100002', requestFor({ sub: '2' })),
    ).rejects.toThrow(UnauthorizedException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(nodeDetailService.detailOf).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(65)])(
    'answers 404 for a node name that cannot exist (%p)',
    async (name) => {
      const { controller, nodeDetailService } = controllerWith();

      await expect(
        controller.findDetail(name, requestFor({ sub: 2 })),
      ).rejects.toThrow(NotFoundException);
      expect(nodeDetailService.detailOf).not.toHaveBeenCalled();
    },
  );
});

describe('NodesController.findTelemetry (SCRUM-307 · F-72, F-75)', () => {
  const QUERY = {
    from: '2026-06-01T00:00:00-05:00',
    to: '2026-07-01T00:00:00-05:00',
  };

  it('reads the telemetry of the trimmed node name over the parsed window within the scope', async () => {
    const { controller, scopeService, nodeTelemetryService } = controllerWith();

    const result = await controller.findTelemetry(
      ' 0000100002 ',
      QUERY,
      requestFor({ sub: 2 }),
    );

    expect(scopeService.resolve).toHaveBeenCalledWith(2);
    expect(nodeTelemetryService.telemetryOf).toHaveBeenCalledWith(
      '0000100002',
      {
        from: new Date('2026-06-01T05:00:00.000Z'),
        to: new Date('2026-07-01T05:00:00.000Z'),
      },
      SCOPE,
    );
    expect(result).toBe(TELEMETRY);
  });

  it.each([
    ['a missing from', { to: QUERY.to }],
    ['a missing to', { from: QUERY.from }],
    ['from equal to to', { from: QUERY.from, to: QUERY.from }],
    [
      'a range of 32 days',
      { from: QUERY.from, to: '2026-07-03T00:00:00-05:00' },
    ],
    ['an unknown parameter', { ...QUERY, custom_id: 'x' }],
  ])(
    'answers 400 for %s before reading the scope or the telemetry',
    async (_case, query) => {
      const { controller, scopeService, nodeTelemetryService } =
        controllerWith();

      await expect(
        controller.findTelemetry('0000100002', query, requestFor({ sub: 2 })),
      ).rejects.toThrow(BadRequestException);
      expect(scopeService.resolve).not.toHaveBeenCalled();
      expect(nodeTelemetryService.telemetryOf).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an empty name', '   '],
    ['an oversized name', 'x'.repeat(65)],
  ])(
    'answers 404 for %s without reading the scope or the telemetry',
    async (_case, name) => {
      const { controller, scopeService, nodeTelemetryService } =
        controllerWith();

      await expect(
        controller.findTelemetry(name, QUERY, requestFor({ sub: 2 })),
      ).rejects.toThrow(NotFoundException);
      expect(scopeService.resolve).not.toHaveBeenCalled();
      expect(nodeTelemetryService.telemetryOf).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['no user', undefined],
    ['a text id', { sub: '2' }],
    ['a zero id', { sub: 0 }],
  ])('rejects a request with %s and reads nothing', async (_case, user) => {
    const { controller, scopeService, nodeTelemetryService } = controllerWith();

    await expect(
      controller.findTelemetry('0000100002', QUERY, requestFor(user)),
    ).rejects.toThrow(UnauthorizedException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
    expect(nodeTelemetryService.telemetryOf).not.toHaveBeenCalled();
  });
});
