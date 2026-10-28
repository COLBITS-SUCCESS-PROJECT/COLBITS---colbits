import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { TokenBlacklist } from './token-blacklist.entity';
import { User } from './user.entity';

const PASSWORD = 'adminpassword';
const TEST_HASH_ROUNDS = 4;

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  // Plain mocks: Repository.create/save are overloaded, so jest.Mocked<Pick<...>> does not type-check.
  let blacklist: {
    create: jest.Mock<TokenBlacklist, [Partial<TokenBlacklist>]>;
    save: jest.Mock<Promise<TokenBlacklist>, [Partial<TokenBlacklist>]>;
  };
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let activeAdmin: User;

  beforeAll(async () => {
    activeAdmin = {
      id: 1,
      username: 'admin@colbits.com',
      password_hash: await bcrypt.hash(PASSWORD, TEST_HASH_ROUNDS),
      role: 'Colbits administrator',
      is_active: true,
    };
  });

  beforeEach(() => {
    users = { findOne: jest.fn() };
    blacklist = {
      create: jest.fn((entity) => entity as TokenBlacklist),
      save: jest.fn(async (entity) => entity as TokenBlacklist),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    service = new AuthService(
      users as unknown as Repository<User>,
      blacklist as unknown as Repository<TokenBlacklist>,
      jwt as unknown as JwtService,
    );
  });

  describe('validateAndLogin (F-01)', () => {
    it('issues an access token with id, username and role for an active account', async () => {
      users.findOne.mockResolvedValue(activeAdmin);

      await expect(service.validateAndLogin('admin@colbits.com', PASSWORD)).resolves.toEqual({
        access_token: 'signed.jwt.token',
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 1,
        username: 'admin@colbits.com',
        role: 'Colbits administrator',
      });
    });

    it('rejects a wrong password', async () => {
      users.findOne.mockResolvedValue(activeAdmin);

      await expect(service.validateAndLogin('admin@colbits.com', 'wrong')).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown username with the same message', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(service.validateAndLogin('nobody', PASSWORD)).rejects.toThrow('Invalid credentials');
    });

    it('rejects an inactive account even with the right password', async () => {
      users.findOne.mockResolvedValue({ ...activeAdmin, is_active: false });

      await expect(service.validateAndLogin('admin@colbits.com', PASSWORD)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['missing username', undefined, PASSWORD],
      ['missing password', 'admin@colbits.com', undefined],
      ['empty username', '', PASSWORD],
      ['non-string username', { $ne: '' }, PASSWORD],
    ])('rejects a %s without querying the database', async (_case, username, password) => {
      await expect(service.validateAndLogin(username, password)).rejects.toThrow('Invalid credentials');
      expect(users.findOne).not.toHaveBeenCalled();
    });
  });

  describe('logout (F-11)', () => {
    it('stores the token in the blacklist', async () => {
      await expect(service.logout('abc.def.ghi')).resolves.toEqual({ message: 'Successfully logged out' });
      expect(blacklist.save).toHaveBeenCalledWith({ token: 'abc.def.ghi' });
    });
  });
});
