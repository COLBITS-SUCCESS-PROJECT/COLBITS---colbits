import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { AuthGuard } from './auth.guard';
import { TokenBlacklist } from './token-blacklist.entity';

const SECRET = 'test-secret';

function contextWith(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('AuthGuard (F-02)', () => {
  let guard: AuthGuard;
  let jwt: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let blacklist: jest.Mocked<Pick<Repository<TokenBlacklist>, 'findOne'>>;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    blacklist = { findOne: jest.fn().mockResolvedValue(null) };
    const config = { getOrThrow: jest.fn().mockReturnValue(SECRET) };
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      blacklist as unknown as Repository<TokenBlacklist>,
      config as unknown as ConfigService,
    );
  });

  it('lets a valid token through and attaches its claims to the request', async () => {
    const claims = { sub: 1, username: 'admin@colbits.com', role: 'Colbits administrator' };
    jwt.verifyAsync.mockResolvedValue(claims);
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer good.token' } };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good.token', { secret: SECRET });
    expect(request.user).toEqual(claims);
  });

  it.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic abc' }],
  ])('rejects a request with %s', async (_case, headers) => {
    await expect(guard.canActivate(contextWith({ headers }))).rejects.toThrow(UnauthorizedException);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects an expired or altered token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      guard.canActivate(contextWith({ headers: { authorization: 'Bearer altered.token' } })),
    ).rejects.toThrow('Invalid or expired token');
  });

  it('rejects a token that was invalidated by logout (F-11)', async () => {
    blacklist.findOne.mockResolvedValue({ id: 1, token: 'old.token' } as TokenBlacklist);

    await expect(
      guard.canActivate(contextWith({ headers: { authorization: 'Bearer old.token' } })),
    ).rejects.toThrow('Token has been invalidated (Logged out)');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});
