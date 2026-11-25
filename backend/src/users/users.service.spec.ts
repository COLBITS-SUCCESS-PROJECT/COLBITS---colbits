import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { UserScope } from '../scope/user-scope.entity';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

/** A raw request body: the request DTOs do not declare `role`, but a client can still send it. */
const createBody = (body: Record<string, unknown>): CreateUserDto =>
  body as unknown as CreateUserDto;
const updateBody = (body: Record<string, unknown>): UpdateUserDto =>
  body as unknown as UpdateUserDto;

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

  it('rejects unsupported scope entity types (F-08)', async () => {
    const { service } = makeFixture();

    await expect(
      service.create({
        username: 'u@colbits.com',
        password: 'secretPassword',
        scopes: [{ entity_type: 'country' as never, entity_id: '1' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents deactivating the last active Colbits administrator (CU-06 flow 2a)', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue({
      id: 1,
      username: 'admin@colbits.com',
      role: 'Colbits administrator',
      is_active: true,
    });
    users.count.mockResolvedValue(1);

    await expect(service.deactivate(1)).rejects.toThrow(BadRequestException);
    await expect(service.update(1, { is_active: false })).rejects.toThrow(
      'Cannot deactivate or demote the last active Colbits administrator',
    );
    expect(users.count).toHaveBeenCalledWith({
      where: { role: 'Colbits administrator', is_active: true },
    });
    expect(users.save).not.toHaveBeenCalled();
  });

  it('lets the last active administrator change their username or password without a last-admin check', async () => {
    const { service, users, scopes } = makeFixture();
    users.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 1
          ? {
              id: 1,
              username: 'admin@colbits.com',
              role: 'Colbits administrator',
              is_active: true,
            }
          : null,
      ),
    );
    users.count.mockResolvedValue(1);

    const result = await service.update(1, {
      username: 'root@colbits.com',
      password: 'anotherPassword',
      is_active: true,
    });

    expect(result).toMatchObject({
      username: 'root@colbits.com',
      role: 'Colbits administrator',
      is_active: true,
      scopes: [],
    });
    expect(users.count).not.toHaveBeenCalled();
    // Existing behavior: an administrator never keeps scope assignments.
    expect(scopes.delete).toHaveBeenCalledWith({ user_id: 1 });
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

describe('UsersService · single administrator (SCRUM-300 · F-03)', () => {
  const NEW_USER = { username: 'new@colbits.com', password: 'secretPassword' };
  const CONSULTATION = {
    id: 2,
    username: 'client@colbits.com',
    role: 'consultation user',
    is_active: true,
  };
  const ADMIN = {
    id: 1,
    username: 'admin@colbits.com',
    role: 'Colbits administrator',
    is_active: true,
  };

  describe('POST /users always creates a consultation user', () => {
    it('creates a consultation user when the body has no role', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue(null);

      const result = await service.create(NEW_USER);

      expect(result.role).toBe('consultation user');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'consultation user' }),
      );
    });

    it('accepts the frontend body (role "consultation user", full_name, scopes) and stores its scopes', async () => {
      const { service, users, scopes } = makeFixture();
      users.findOne.mockResolvedValue(null);
      const assignments = [
        { entity_type: 'circuit', entity_id: '1' },
        { entity_type: 'node', entity_id: '0000100001' },
      ];

      const result = await service.create(
        createBody({
          ...NEW_USER,
          full_name: 'Paula Ríos',
          role: 'consultation user',
          scopes: assignments,
        }),
      );

      expect(result).toEqual({
        id: 10,
        username: 'new@colbits.com',
        role: 'consultation user',
        is_active: true,
        scopes: assignments,
      });
      expect(scopes.save).toHaveBeenCalledWith(
        assignments.map((scope) => ({ user_id: 10, ...scope })),
      );
    });

    it('rejects a request to create a Colbits administrator with 400 and writes nothing', async () => {
      const { service, users, scopes } = makeFixture();
      users.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          createBody({
            ...NEW_USER,
            role: 'Colbits administrator',
            scopes: [{ entity_type: 'circuit', entity_id: '1' }],
          }),
        ),
      ).rejects.toThrow(
        'A second Colbits administrator cannot be created: new users are always consultation users (F-03)',
      );
      expect(users.findOne).not.toHaveBeenCalled();
      expect(users.create).not.toHaveBeenCalled();
      expect(users.save).not.toHaveBeenCalled();
      expect(scopes.delete).not.toHaveBeenCalled();
      expect(scopes.save).not.toHaveBeenCalled();
    });

    it.each([
      ['null', null],
      ['an empty string', ''],
      ['an unknown role', 'superadmin'],
      ['a different case', 'colbits administrator'],
      ['surrounding spaces', ' Colbits administrator '],
      ['consultation role with a space', 'consultation user '],
      ['a number', 1],
      ['a boolean', true],
      ['an array holding the consultation role', ['consultation user']],
      ['an array holding the administrator role', ['Colbits administrator']],
      ['an object', { name: 'Colbits administrator' }],
    ])(
      'rejects role as %s with 400 and writes nothing',
      async (_label, role) => {
        const { service, users } = makeFixture();
        users.findOne.mockResolvedValue(null);

        await expect(
          service.create(createBody({ ...NEW_USER, role })),
        ).rejects.toThrow(
          "role must be omitted or be 'consultation user': new users are always consultation users (F-03)",
        );
        expect(users.create).not.toHaveBeenCalled();
        expect(users.save).not.toHaveBeenCalled();
      },
    );

    it('ignores other fields that could set the account (id, is_active, password_hash)', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue(null);

      const result = await service.create(
        createBody({
          ...NEW_USER,
          id: 1,
          is_active: false,
          password_hash: 'not-a-hash',
        }),
      );

      const created = users.create.mock.calls[0][0];
      expect(Object.keys(created).sort()).toEqual([
        'is_active',
        'password_hash',
        'role',
        'username',
      ]);
      expect(created.is_active).toBe(true);
      expect(created.password_hash).toMatch(/^\$2[ab]\$/);
      expect(result).toMatchObject({ id: 10, is_active: true });
    });

    it('cannot be given a role through a JSON __proto__ member', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue(null);
      // What a JSON body parser yields: `__proto__` becomes an own key, not the prototype.
      const body = JSON.parse(
        '{"username":"new@colbits.com","password":"secretPassword","__proto__":{"role":"Colbits administrator"}}',
      ) as CreateUserDto;

      const result = await service.create(body);

      expect(result.role).toBe('consultation user');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'consultation user' }),
      );
    });
  });

  describe('PATCH /users/:id never changes a role', () => {
    it.each([
      ['promote a consultation user', CONSULTATION, 'Colbits administrator'],
      ['repeat a consultation user role', CONSULTATION, 'consultation user'],
      ['demote the administrator', ADMIN, 'consultation user'],
      ['repeat the administrator role', ADMIN, 'Colbits administrator'],
      ['send a null role', CONSULTATION, null],
      ['send an unknown role', CONSULTATION, 'superadmin'],
    ])(
      'rejects a body that tries to %s with 400 and writes nothing',
      async (_label, target, role) => {
        const { service, users, scopes } = makeFixture();
        users.findOne.mockResolvedValue({ ...target });
        users.count.mockResolvedValue(1);

        await expect(
          service.update(target.id, updateBody({ role })),
        ).rejects.toThrow(
          'role cannot be changed: the platform has a single Colbits administrator (F-03)',
        );
        expect(users.save).not.toHaveBeenCalled();
        expect(users.count).not.toHaveBeenCalled();
        expect(scopes.delete).not.toHaveBeenCalled();
        expect(scopes.save).not.toHaveBeenCalled();
      },
    );

    it('rejects the whole update when role comes with other changes: nothing else is applied', async () => {
      const { service, users, scopes } = makeFixture();
      const stored = { ...CONSULTATION, password_hash: 'stored-hash' };
      users.findOne.mockResolvedValue(stored);

      await expect(
        service.update(
          2,
          updateBody({
            username: 'renamed@colbits.com',
            password: 'anotherPassword',
            is_active: false,
            scopes: [{ entity_type: 'zone', entity_id: '1' }],
            role: 'consultation user',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(stored).toEqual({ ...CONSULTATION, password_hash: 'stored-hash' });
      expect(users.save).not.toHaveBeenCalled();
      expect(scopes.delete).not.toHaveBeenCalled();
    });

    it('answers 404 before the role check for a user that does not exist', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, updateBody({ role: 'consultation user' })),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot be given a role through a JSON __proto__ member', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue({ ...CONSULTATION });
      const body = JSON.parse(
        '{"is_active":true,"__proto__":{"role":"Colbits administrator"}}',
      ) as UpdateUserDto;

      const result = await service.update(2, body);

      expect(result.role).toBe('consultation user');
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'consultation user' }),
      );
    });

    it('keeps updating username, password, is_active and scopes without role, and keeps the role', async () => {
      const { service, users, scopes } = makeFixture();
      const stored = { ...CONSULTATION, password_hash: 'stored-hash' };
      users.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 2 ? stored : null),
      );
      const assignments = [{ entity_type: 'zone', entity_id: '1' }];

      const result = await service.update(
        2,
        updateBody({
          username: 'renamed@colbits.com',
          full_name: 'Renamed',
          password: 'anotherPassword',
          is_active: false,
          scopes: assignments,
        }),
      );

      expect(result).toEqual({
        id: 2,
        username: 'renamed@colbits.com',
        role: 'consultation user',
        is_active: false,
        scopes: assignments,
      });
      const saved = users.save.mock.calls[0][0];
      expect(saved.role).toBe('consultation user');
      expect(saved.password_hash).not.toBe('stored-hash');
      expect(saved.password_hash).toMatch(/^\$2[ab]\$/);
      expect(scopes.save).toHaveBeenCalledTimes(1);
    });

    it('still lets the administrator be deactivated while another active administrator exists', async () => {
      const { service, users } = makeFixture();
      users.findOne.mockResolvedValue({ ...ADMIN });
      users.count.mockResolvedValue(2);

      const result = await service.update(1, { is_active: false });

      expect(result).toMatchObject({
        role: 'Colbits administrator',
        is_active: false,
      });
    });
  });

  it('PUT /users/:id/scopes and PATCH /users/:id/deactivate never write a role', async () => {
    const { service, users } = makeFixture();
    users.findOne.mockResolvedValue({ ...CONSULTATION });

    // The controller passes only `scopes` to the service; the deactivate route reads no body.
    await service.assignScopes(2, [{ entity_type: 'zone', entity_id: '1' }]);
    await service.deactivate(2);

    expect(users.save).toHaveBeenCalledTimes(1);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'consultation user', is_active: false }),
    );
  });
});
