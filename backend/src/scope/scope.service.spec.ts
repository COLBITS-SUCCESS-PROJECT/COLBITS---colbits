import { ScopeService } from './scope.service';
import { User } from '../auth/user.entity';
import { Repository } from 'typeorm';

describe('ScopeService', () => {
  let service: ScopeService;
  let usersRepository: jest.Mocked<
    Pick<Repository<User>, 'findOne'>
  >;

  beforeEach(() => {
    usersRepository = {
      findOne: jest.fn(),
    };

    service = new ScopeService(
      usersRepository as unknown as Repository<User>,
    );
  });

  it('grants unrestricted access to an active administrator', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 1,
      role: 'Colbits administrator',
      is_active: true,
    } as User);

    await expect(service.resolve(1)).resolves.toEqual({
      kind: 'unrestricted',
    });
  });

  it('restricts an active consultation user', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 2,
      role: 'consultation user',
      is_active: true,
    } as User);

    await expect(service.resolve(2)).resolves.toEqual({
      kind: 'restricted',
      userId: 2,
    });
  });

  it('denies network access to an inactive user', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 3,
      role: 'consultation user',
      is_active: false,
    } as User);

    await expect(service.resolve(3)).resolves.toEqual({
      kind: 'empty',
    });
  });

  it('denies access when the user does not exist', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.resolve(999)).resolves.toEqual({
      kind: 'empty',
    });
  });

  it('rejects invalid user identities', async () => {
    await expect(service.resolve(0)).rejects.toThrow(
      'Invalid user identity',
    );

    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

  it('denies access to an unknown role', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 4,
      role: 'unknown role',
      is_active: true,
    } as User);

    await expect(service.resolve(4)).resolves.toEqual({
      kind: 'empty',
    });
  });

  it('does not grant access when the database fails', async () => {
    usersRepository.findOne.mockRejectedValue(
      new Error('Database connection failed'),
    );

    await expect(service.resolve(5)).rejects.toThrow(
      'Database connection failed',
    );
  });

  it('rejects malformed user IDs', async () => {
    for (const id of [-1, 1.5, NaN, Infinity]) {
      await expect(service.resolve(id)).rejects.toThrow(
        'Invalid user identity',
      );
    }

    expect(usersRepository.findOne).not.toHaveBeenCalled();
  });

});
