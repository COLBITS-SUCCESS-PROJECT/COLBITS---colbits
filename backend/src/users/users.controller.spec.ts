import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController & AdminGuard (US19 · F-05, F-06, F-07, F-08, F-09)', () => {
  const service = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 2 }),
    create: jest.fn().mockResolvedValue({ id: 3 }),
    update: jest.fn().mockResolvedValue({ id: 2 }),
    deactivate: jest.fn().mockResolvedValue({ id: 2, is_active: false }),
    assignScopes: jest.fn().mockResolvedValue({ id: 2, scopes: [] }),
  };
  const controller = new UsersController(service as unknown as UsersService);
  const guard = new AdminGuard();

  const contextForRole = (role?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { sub: 1, role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it('AdminGuard allows Colbits administrator and rejects consultation users with 403 (F-05)', () => {
    expect(guard.canActivate(contextForRole('Colbits administrator'))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(contextForRole('consultation user')),
    ).toThrow(ForbiddenException);
  });

  it('delegates create, update, deactivate and assignScopes to UsersService', async () => {
    await controller.findAll();
    await controller.findOne(2);
    await controller.create({
      username: 'a@b.co',
      password: 'password123',
    });
    await controller.update(2, { is_active: false });
    await controller.deactivate(2);
    await controller.assignScopes(2, {
      scopes: [{ entity_type: 'zone', entity_id: '1' }],
    });

    expect(service.findAll).toHaveBeenCalled();
    expect(service.findOne).toHaveBeenCalledWith(2);
    expect(service.create).toHaveBeenCalled();
    expect(service.update).toHaveBeenCalledWith(2, { is_active: false });
    expect(service.deactivate).toHaveBeenCalledWith(2);
    expect(service.assignScopes).toHaveBeenCalledWith(2, [
      { entity_type: 'zone', entity_id: '1' },
    ]);
  });
});
