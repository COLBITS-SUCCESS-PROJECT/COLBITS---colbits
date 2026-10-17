import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = {
    validateAndLogin: jest.fn().mockResolvedValue({ access_token: 't' }),
    logout: jest.fn().mockResolvedValue({ message: 'Successfully logged out' }),
  };
  const controller = new AuthController(authService as unknown as AuthService);

  beforeEach(() => jest.clearAllMocks());

  it('logs in with the username and password of the body', async () => {
    await expect(controller.login({ username: 'admin@colbits.com', password: 'p' })).resolves.toEqual({
      access_token: 't',
    });
    expect(authService.validateAndLogin).toHaveBeenCalledWith('admin@colbits.com', 'p');
  });

  it('logs out the token of the Authorization header', async () => {
    await controller.logout({ headers: { authorization: 'Bearer abc.def.ghi' } });

    expect(authService.logout).toHaveBeenCalledWith('abc.def.ghi');
  });

  it('rejects a logout without a token', async () => {
    await expect(controller.logout({ headers: {} })).rejects.toThrow(UnauthorizedException);
  });
});
