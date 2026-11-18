import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { UserScope } from '../scope/user-scope.entity';
import { UsersService } from './users.service';

function makeFixture() {
  const users = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn((x) => ({ id: 10, ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
  };
  const scopes = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve(x)),
  };
  const service = new UsersService(
    users as unknown as Repository<User>,
    scopes as unknown as Repository<UserScope>,
  );
  return { service, users, scopes };
}

describe('UsersService (US19 · F-05, F-07, F-08, F-09)', () => {
  it('creates a consultation user with hashed password and shareable scopes across all 5 hierarchy levels', async () => {
    const { service, users, scopes } = makeFixture();
    users.findOne.mockResolvedValue(null);

    const result = await service.create({
      username: 'newclient@colbits.com',
      password: 'secretPassword',
      role: 'consultation user',
      scopes: [
        { entity_type: 'zone', entity_id: '1' },
        { entity_type: 'substation', entity_id: '2' },
        { entity_type: 'circuit', entity_id: '3' },
        { entity_type: 'node', entity_id: '0000100001' },
        { entity_type: 'device', entity_id: '1301000001' },
      ],
    });

    expect(result.username).toBe('newclient@colbits.com');
    expect(result.role).toBe('consultation user');
    expect(result.is_active).toBe(true);
    expect(result.scopes).toHaveLength(5);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'newclient@colbits.com',
        role: 'consultation user',
        is_active: true,
      }),
    );
    const savedArg = users.create.mock.calls[0][0];
    expect(savedArg.password_hash).not.toBe('secretPassword');
    expect(savedArg.password_hash).toMatch(/^\$2[ab]\$/);
    expect(scopes.save).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate usernames with 409 Conflict', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue({ id: 1, username: 'taken@colbits.com' });

    await expect(
      service.create({
        username: 'taken@colbits.com',
        password: 'secretPassword',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects unsupported roles (F-03) and unsupported scope entity types (F-08)', async () => {
    const { service } = makeFixture();

    await expect(
      service.create({
        username: 'u@colbits.com',
        password: 'secretPassword',
        role: 'superadmin' as never,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create({
        username: 'u@colbits.com',
        password: 'secretPassword',
        scopes: [{ entity_type: 'country' as never, entity_id: '1' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents deactivating or demoting the last active Colbits administrator (CU-06 flow 2a)', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue({
      id: 1,
      username: 'admin@colbits.com',
      role: 'Colbits administrator',
      is_active: true,
    });
    users.count.mockResolvedValue(1);

    await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
    await expect(
      service.update(1, { role: 'consultation user' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('deactivates a consultation user and allows deactivating an admin when another active admin exists', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue({
      id: 2,
      username: 'client@colbits.com',
      role: 'consultation user',
      is_active: true,
    });

    const deactivated = await service.deactivate(2);
    expect(deactivated.is_active).toBe(false);

    users.findOne.mockResolvedValue({
      id: 1,
      username: 'admin1@colbits.com',
      role: 'Colbits administrator',
      is_active: true,
    });
    users.count.mockResolvedValue(2);

    const adminDeactivated = await service.deactivate(1);
    expect(adminDeactivated.is_active).toBe(false);
  });

  it('allows the same circuit or device to be assigned to multiple consultation users (F-09)', async () => {
    const { service, users, scopes } = makeFixture();
    users.findOne.mockImplementation(({ where: { id } }) =>
      Promise.resolve({
        id,
        username: `user${id}@colbits.com`,
        role: 'consultation user',
        is_active: true,
      }),
    );

    const sharedScope = [
      { entity_type: 'circuit' as const, entity_id: '1' },
      { entity_type: 'device' as const, entity_id: '1301000001' },
    ];

    const u1 = await service.assignScopes(2, sharedScope);
    const u2 = await service.assignScopes(3, sharedScope);

    expect(u1.scopes).toEqual(sharedScope);
    expect(u2.scopes).toEqual(sharedScope);
    expect(scopes.save).toHaveBeenCalledTimes(2);
  });

  it('throws 404 when the target user does not exist', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });
});
