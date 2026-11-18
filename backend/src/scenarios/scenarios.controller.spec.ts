import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ScopeService } from '../scope/scope.service';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

function controllerWith() {
  const resolve = jest.fn().mockResolvedValue({ kind: 'unrestricted' });
  const run = jest.fn().mockResolvedValue({ action: 'OPEN_FUSE' });
  const status = jest.fn().mockReturnValue({ enabled: true, actions: [] });
  const controller = new ScenariosController(
    { run, status } as unknown as ScenariosService,
    { resolve } as unknown as ScopeService,
  );
  return { controller, resolve, run, status };
}

const requestFor = (user?: Record<string, unknown>) =>
  ({ user }) as unknown as Request;
const BODY = { action: 'OPEN_FUSE', target: '0000100002-A-R' } as const;

describe('ScenariosController (US31 · F-100)', () => {
  it('GET returns the demo-mode status', () => {
    const { controller, status } = controllerWith();

    expect(controller.status()).toEqual({ enabled: true, actions: [] });
    expect(status).toHaveBeenCalled();
  });

  it('POST runs the scenario in the scope of the administrator in the token', async () => {
    const { controller, resolve, run } = controllerWith();

    await controller.run(
      BODY,
      requestFor({ sub: 1, role: 'Colbits administrator' }),
    );

    expect(resolve).toHaveBeenCalledWith(1);
    expect(run).toHaveBeenCalledWith(BODY, { kind: 'unrestricted' });
  });

  it('POST refuses a consultation user', async () => {
    const { controller, run } = controllerWith();

    await expect(
      controller.run(BODY, requestFor({ sub: 2, role: 'consultation user' })),
    ).rejects.toThrow(ForbiddenException);
    expect(run).not.toHaveBeenCalled();
  });

  it('POST refuses a token without a valid user id', async () => {
    const { controller, run } = controllerWith();

    await expect(
      controller.run(
        BODY,
        requestFor({ sub: '1', role: 'Colbits administrator' }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(run).not.toHaveBeenCalled();
  });
});
