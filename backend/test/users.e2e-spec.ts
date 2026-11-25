import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  IsolatedApp,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-300 · F-03 (Requirements Specification v2.4) against a real database, through HTTP: the
// platform has a single Colbits administrator, created by the seed script. POST /users always
// creates a consultation user (a body without role, or with 'consultation user' as the frontend
// sends it); a request to create a Colbits administrator, or any other role value, is rejected
// with 400. PATCH /users/:id rejects any body with a role, even the current one. Every other user
// management behavior (updates without role, scopes, last-administrator protection, admin-only
// access) is unchanged.
//
// Expectations are checked on the HTTP answer and with plain SQL on the users and user_scopes
// tables. The seed's circuit 1 and node 0000100001 are used as scope entities, so the spec keeps
// working when scope entities are validated (SCRUM-301).
//
// Uses the isolated database of the F-10 tests and removes every row it creates. The
// last-administrator test deactivates the other active administrators (the seed's) for its
// duration and reactivates them afterwards, also when the spec fails.

const LABEL = 'SCRUM-300 single administrator';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const PREFIX = 'users-e2e-';
const DOMAIN = '@test.local';
const username = (name: string): string => `${PREFIX}${name}${DOMAIN}`;
const USERS = {
  admin: username('admin'),
  consultation: username('consultation'),
};
const ADMIN_ROLE = 'Colbits administrator';
const CONSULTATION_ROLE = 'consultation user';
const SCOPES = [
  { entity_type: 'circuit', entity_id: '1' },
  { entity_type: 'node', entity_id: '0000100001' },
];

const CREATE_ADMIN_MESSAGE =
  'A second Colbits administrator cannot be created: new users are always consultation users (F-03)';
const CREATE_ROLE_MESSAGE =
  "role must be omitted or be 'consultation user': new users are always consultation users (F-03)";
const PATCH_ROLE_MESSAGE =
  'role cannot be changed: the platform has a single Colbits administrator (F-03)';

/** Administrators other than the spec's own that the last-administrator test deactivated. */
let deactivatedAdmins: number[] = [];

async function reactivateAdmins(dataSource: DataSource): Promise<void> {
  if (deactivatedAdmins.length === 0) return;
  await dataSource.query(
    'UPDATE users SET is_active = TRUE WHERE id = ANY($1)',
    [deactivatedAdmins],
  );
  deactivatedAdmins = [];
}

async function remove(dataSource: DataSource): Promise<void> {
  await reactivateAdmins(dataSource);
  // user_scopes rows go with their user (ON DELETE CASCADE).
  await dataSource.query('DELETE FROM users WHERE username LIKE $1', [
    `${PREFIX}%${DOMAIN}`,
  ]);
}

async function createUsers(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const [name, role] of [
    [USERS.admin, ADMIN_ROLE],
    [USERS.consultation, CONSULTATION_ROLE],
  ]) {
    await dataSource.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [name, hash, role],
    );
  }
}

interface UserBody {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  scopes: Array<{ entity_type: string; entity_id: string }>;
}

interface UserRow {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

describe('F-03: a single Colbits administrator (e2e)', () => {
  let started: IsolatedApp | undefined;
  let tokens: { admin: string; consultation: string };
  let ids: { admin: number; consultation: number };

  const server = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.getHttpServer();
  };
  const dataSource = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.dataSource;
  };

  const login = (name: string, password = PASSWORD) =>
    request(server()).post('/auth/login').send({ username: name, password });
  const tokenOf = async (name: string): Promise<string> =>
    (await login(name).expect(200)).body.access_token as string;
  const auth = (token: string) => `Bearer ${token}`;
  const post = (body: unknown, token = tokens.admin) =>
    request(server())
      .post('/users')
      .set('Authorization', auth(token))
      .send(body as object);
  const patch = (id: number, body: unknown, token = tokens.admin) =>
    request(server())
      .patch(`/users/${id}`)
      .set('Authorization', auth(token))
      .send(body as object);

  /** Plain SQL on the users table, independent of the users service. */
  const rowOf = async (name: string): Promise<UserRow | undefined> =>
    (
      (await dataSource().query(
        'SELECT id, username, role::text AS role, is_active FROM users WHERE username = $1',
        [name],
      )) as UserRow[]
    )[0];
  const rowById = async (id: number): Promise<UserRow | undefined> =>
    (
      (await dataSource().query(
        'SELECT id, username, role::text AS role, is_active FROM users WHERE id = $1',
        [id],
      )) as UserRow[]
    )[0];
  const scopesOf = async (id: number) =>
    (await dataSource().query(
      'SELECT entity_type, entity_id FROM user_scopes WHERE user_id = $1 ORDER BY id',
      [id],
    )) as Array<{ entity_type: string; entity_id: string }>;
  const administrators = async (): Promise<UserRow[]> =>
    (await dataSource().query(
      `SELECT id, username, role::text AS role, is_active FROM users
        WHERE role = 'Colbits administrator' ORDER BY id`,
    )) as UserRow[];
  /** The role inside a token, as GET /auth/profile reports it. */
  const tokenRole = async (token: string): Promise<string> =>
    (
      await request(server())
        .get('/auth/profile')
        .set('Authorization', auth(token))
        .expect(200)
    ).body.user.role as string;

  let administratorsBefore: UserRow[];

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create: createUsers });
    try {
      tokens = {
        admin: await tokenOf(USERS.admin),
        consultation: await tokenOf(USERS.consultation),
      };
      ids = {
        admin: (await rowOf(USERS.admin))!.id,
        consultation: (await rowOf(USERS.consultation))!.id,
      };
      administratorsBefore = await administrators();
    } catch (error) {
      await stopIsolatedApp(started, LABEL, remove);
      throw error;
    }
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  describe('POST /users', () => {
    it('creates a consultation user, with its scopes, from a body without role', async () => {
      const name = username('no-role');

      const response = await post({
        username: name,
        password: PASSWORD,
        scopes: SCOPES,
      }).expect(201);

      const body = response.body as UserBody;
      expect(body).toMatchObject({
        username: name,
        role: CONSULTATION_ROLE,
        is_active: true,
        scopes: SCOPES,
      });
      expect(await rowOf(name)).toMatchObject({
        role: CONSULTATION_ROLE,
        is_active: true,
      });
      expect(await scopesOf(body.id)).toEqual(SCOPES);
    });

    it('accepts the exact body the frontend sends (full_name, role "consultation user", scopes)', async () => {
      const name = username('frontend');

      const response = await post({
        username: name,
        full_name: 'Paula Ríos',
        password: PASSWORD,
        role: CONSULTATION_ROLE,
        scopes: SCOPES,
      }).expect(201);

      const body = response.body as UserBody;
      expect(body).toEqual({
        id: body.id,
        username: name,
        role: CONSULTATION_ROLE,
        is_active: true,
        scopes: SCOPES,
      });
      expect((await rowOf(name))?.role).toBe(CONSULTATION_ROLE);
      expect(await scopesOf(body.id)).toEqual(SCOPES);
      // The account works, and its token carries the consultation role.
      expect(await tokenRole(await tokenOf(name))).toBe(CONSULTATION_ROLE);
    });

    it('rejects a request to create a Colbits administrator with 400 and stores nothing', async () => {
      const name = username('second-admin');

      const response = await post({
        username: name,
        password: PASSWORD,
        role: ADMIN_ROLE,
        scopes: SCOPES,
      }).expect(400);

      expect(response.body.message).toBe(CREATE_ADMIN_MESSAGE);
      expect(await rowOf(name)).toBeUndefined();
      expect(await administrators()).toEqual(administratorsBefore);
      await login(name).expect(401);
    });

    it.each([
      ['null', null],
      ['an empty string', ''],
      ['an unknown role', 'superadmin'],
      ['a different case', 'colbits administrator'],
      ['surrounding spaces', ' Colbits administrator '],
      ['a number', 1],
      ['a boolean', true],
      ['an array holding the consultation role', [CONSULTATION_ROLE]],
      ['an array holding the administrator role', [ADMIN_ROLE]],
      ['an object', { role: ADMIN_ROLE }],
    ])(
      'rejects role as %s with 400 and stores nothing',
      async (label, role) => {
        const name = username(`invalid-${label.replace(/\W+/g, '-')}`);

        const response = await post({
          username: name,
          password: PASSWORD,
          role,
        }).expect(400);

        expect(response.body.message).toBe(CREATE_ROLE_MESSAGE);
        expect(await rowOf(name)).toBeUndefined();
      },
    );

    it('cannot be given an administrator role through __proto__, another key, the query string or account fields', async () => {
      // A raw JSON body: `__proto__` arrives as an own key of the parsed body, not as its prototype.
      const proto = username('proto');
      const protoResponse = await request(server())
        .post('/users')
        .set('Authorization', auth(tokens.admin))
        .set('Content-Type', 'application/json')
        .send(
          `{"username":"${proto}","password":"${PASSWORD}","__proto__":{"role":"${ADMIN_ROLE}"}}`,
        );
      expect(protoResponse.status).toBe(201);
      expect(protoResponse.body.role).toBe(CONSULTATION_ROLE);
      expect((await rowOf(proto))?.role).toBe(CONSULTATION_ROLE);

      // Keys that are not `role` are ignored, and so is a role in the query string.
      const other = username('other-keys');
      await request(server())
        .post(`/users?role=${encodeURIComponent(ADMIN_ROLE)}`)
        .set('Authorization', auth(tokens.admin))
        .send({
          username: other,
          password: PASSWORD,
          Role: ADMIN_ROLE,
          roles: [ADMIN_ROLE],
        })
        .expect(201);
      expect((await rowOf(other))?.role).toBe(CONSULTATION_ROLE);

      // Account fields the client must not set: id, is_active, password_hash.
      const fields = username('account-fields');
      const response = await post({
        username: fields,
        password: PASSWORD,
        id: ids.admin,
        is_active: false,
        password_hash: 'not-a-hash',
      }).expect(201);
      const row = await rowOf(fields);
      expect(row).toMatchObject({ role: CONSULTATION_ROLE, is_active: true });
      expect(row?.id).not.toBe(ids.admin);
      expect(response.body.id).toBe(row?.id);
      await login(fields).expect(200); // the password was hashed, not the given hash stored

      expect(await administrators()).toEqual(administratorsBefore);
    });
  });

  describe('PATCH /users/:id', () => {
    let target: number;

    beforeAll(async () => {
      const response = await post({
        username: username('patch-target'),
        password: PASSWORD,
        scopes: SCOPES,
      }).expect(201);
      target = (response.body as UserBody).id;
    });

    it.each([
      ['promotes a consultation user', 'consultation', ADMIN_ROLE],
      ['repeats a consultation user role', 'consultation', CONSULTATION_ROLE],
      ['demotes the administrator', 'admin', CONSULTATION_ROLE],
      ['repeats the administrator role', 'admin', ADMIN_ROLE],
      ['sends a null role', 'consultation', null],
      ['sends an unknown role', 'consultation', 'superadmin'],
    ] as const)(
      'rejects a body that %s with 400 and changes nothing',
      async (_label, who, role) => {
        const id = ids[who];
        const before = await rowById(id);

        const response = await patch(id, { role }).expect(400);

        expect(response.body.message).toBe(PATCH_ROLE_MESSAGE);
        expect(await rowById(id)).toEqual(before);
      },
    );

    it('rejects the whole update when role comes with other changes', async () => {
      const before = await rowById(target);
      const scopesBefore = await scopesOf(target);

      await patch(target, {
        username: username('patch-renamed-by-role'),
        password: 'anotherPassword',
        is_active: false,
        scopes: [{ entity_type: 'circuit', entity_id: '1' }],
        role: CONSULTATION_ROLE,
      }).expect(400);

      expect(await rowById(target)).toEqual(before);
      expect(await scopesOf(target)).toEqual(scopesBefore);
      await login(before!.username).expect(200); // the password did not change
    });

    it('keeps updating without role: the frontend edit body, password, deactivation and reactivation', async () => {
      const renamed = username('patch-renamed');
      const newScopes = [{ entity_type: 'circuit', entity_id: '1' }];

      // The body the frontend's edit form sends.
      const edited = await patch(target, {
        username: renamed,
        full_name: 'Renamed User',
        scopes: newScopes,
      }).expect(200);
      expect(edited.body).toEqual({
        id: target,
        username: renamed,
        role: CONSULTATION_ROLE,
        is_active: true,
        scopes: newScopes,
      });
      expect(await scopesOf(target)).toEqual(newScopes);

      const newPassword = randomBytes(12).toString('base64url');
      await patch(target, { password: newPassword }).expect(200);
      await login(renamed, newPassword).expect(200);

      await patch(target, { is_active: false }).expect(200);
      expect(await rowById(target)).toMatchObject({ is_active: false });
      await login(renamed, newPassword).expect(401);

      await patch(target, { is_active: true }).expect(200);
      expect(await rowById(target)).toMatchObject({
        role: CONSULTATION_ROLE,
        is_active: true,
      });
    });

    it('lets the administrator rename itself without changing its role', async () => {
      const response = await patch(ids.admin, { username: USERS.admin }).expect(
        200,
      );

      expect(response.body).toMatchObject({
        role: ADMIN_ROLE,
        is_active: true,
      });
      expect(await rowById(ids.admin)).toMatchObject({
        role: ADMIN_ROLE,
        is_active: true,
      });
    });
  });

  describe('other user-management routes cannot set a role', () => {
    it('ignores a role sent to PUT /users/:id/scopes and PATCH /users/:id/deactivate', async () => {
      const response = await post({
        username: username('other-routes'),
        password: PASSWORD,
      }).expect(201);
      const id = (response.body as UserBody).id;

      await request(server())
        .put(`/users/${id}/scopes`)
        .set('Authorization', auth(tokens.admin))
        .send({ scopes: SCOPES, role: ADMIN_ROLE })
        .expect(200);
      expect(await rowById(id)).toMatchObject({ role: CONSULTATION_ROLE });
      expect(await scopesOf(id)).toEqual(SCOPES);

      await request(server())
        .patch(`/users/${id}/deactivate`)
        .set('Authorization', auth(tokens.admin))
        .send({ role: ADMIN_ROLE, is_active: true })
        .expect(200);
      expect(await rowById(id)).toMatchObject({
        role: CONSULTATION_ROLE,
        is_active: false,
      });
    });
  });

  describe('last active administrator (CU-06 flow 2a)', () => {
    it('cannot be deactivated through PATCH /users/:id or PATCH /users/:id/deactivate', async () => {
      try {
        // Only the spec's administrator stays active, so it is the last one.
        const rows = (await dataSource().query(
          `UPDATE users SET is_active = FALSE
            WHERE role = 'Colbits administrator' AND is_active AND id <> $1
            RETURNING id`,
          [ids.admin],
        )) as [Array<{ id: number }>, number];
        deactivatedAdmins = rows[0].map((row) => row.id);
        expect(
          (await administrators()).filter((admin) => admin.is_active),
        ).toEqual([expect.objectContaining({ id: ids.admin })]);

        await patch(ids.admin, { is_active: false }).expect(400);
        await request(server())
          .patch(`/users/${ids.admin}/deactivate`)
          .set('Authorization', auth(tokens.admin))
          .expect(400);

        expect(await rowById(ids.admin)).toMatchObject({
          role: ADMIN_ROLE,
          is_active: true,
        });
      } finally {
        await reactivateAdmins(dataSource());
      }
      expect(await administrators()).toEqual(administratorsBefore);
    });
  });

  describe('only the Colbits administrator manages users (F-05, F-06)', () => {
    it('refuses every user-management write of a consultation user with 403, role or not, and stores nothing', async () => {
      const name = username('by-consultation');

      await post(
        { username: name, password: PASSWORD },
        tokens.consultation,
      ).expect(403);
      await post(
        { username: name, password: PASSWORD, role: ADMIN_ROLE },
        tokens.consultation,
      ).expect(403);
      await patch(
        ids.consultation,
        { role: ADMIN_ROLE },
        tokens.consultation,
      ).expect(403);
      await patch(
        ids.consultation,
        { username: name },
        tokens.consultation,
      ).expect(403);
      await request(server())
        .put(`/users/${ids.consultation}/scopes`)
        .set('Authorization', auth(tokens.consultation))
        .send({ scopes: SCOPES })
        .expect(403);
      await request(server())
        .get('/users')
        .set('Authorization', auth(tokens.consultation))
        .expect(403);

      expect(await rowOf(name)).toBeUndefined();
      expect(await rowById(ids.consultation)).toMatchObject({
        username: USERS.consultation,
        role: CONSULTATION_ROLE,
      });
    });

    it('refuses requests without a token with 401', async () => {
      const name = username('anonymous');

      await request(server())
        .post('/users')
        .send({ username: name, password: PASSWORD, role: ADMIN_ROLE })
        .expect(401);
      await request(server())
        .patch(`/users/${ids.consultation}`)
        .send({ role: ADMIN_ROLE })
        .expect(401);

      expect(await rowOf(name)).toBeUndefined();
    });
  });

  it('ends with the same administrators it started with: none was created or promoted', async () => {
    expect(await administrators()).toEqual(administratorsBefore);
    const created = (await dataSource().query(
      `SELECT count(*)::int AS count FROM users
        WHERE username LIKE $1 AND role = 'Colbits administrator'`,
      [`${PREFIX}%${DOMAIN}`],
    )) as Array<{ count: number }>;
    expect(created[0].count).toBe(1); // the spec's own fixture administrator
  });
});
