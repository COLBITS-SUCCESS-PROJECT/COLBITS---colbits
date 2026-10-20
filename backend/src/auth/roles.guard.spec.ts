import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function contextWith(method: string, role?: string): ExecutionContext {
  const request = { method, user: role ? { role } : undefined };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('RolesGuard (F-06)', () => {
  const guard = new RolesGuard();

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('forbids %s for a consultation user', (method) => {
    expect(() => guard.canActivate(contextWith(method, 'consultation user'))).toThrow(ForbiddenException);
  });

  it('lets a consultation user read', () => {
    expect(guard.canActivate(contextWith('GET', 'consultation user'))).toBe(true);
  });

  it('lets an administrator write', () => {
    expect(guard.canActivate(contextWith('POST', 'Colbits administrator'))).toBe(true);
  });

  it('leaves requests without a user to the AuthGuard', () => {
    expect(guard.canActivate(contextWith('POST'))).toBe(true);
  });
});
