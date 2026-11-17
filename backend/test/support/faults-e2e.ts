import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IsolatedApp, startIsolatedApp, stopIsolatedApp } from './isolated-e2e';

/**
 * Shared set-up of the fault-list e2e specs (LOW_ENERGY, DEVICE_INACTIVITY): three users (an
 * administrator, a consultation user of the fixtures' circuit and one of another circuit), an
 * isolated app with the spec's settings, and authenticated calls to GET /faults,
 * GET /faults/resolved and POST /scenarios.
 */
export interface ScopedUsers {
  admin: string;
  inScope: string;
  outOfScope: string;
}

/** The three users, each consultation user scoped to one circuit. */
export async function createScopedUsers(
  dataSource: DataSource,
  users: ScopedUsers,
  password: string,
  circuits: { inScope: number; outOfScope: number },
): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  for (const [username, role, circuit] of [
    [users.admin, 'Colbits administrator', null],
    [users.inScope, 'consultation user', circuits.inScope],
    [users.outOfScope, 'consultation user', circuits.outOfScope],
  ] as const) {
    const [user]: { id: number }[] = await dataSource.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [username, hash, role],
    );
    if (circuit !== null) {
      await dataSource.query(
        `INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', $2)`,
        [user.id, String(circuit)],
      );
    }
  }
}

/**
 * Registers beforeAll / afterAll (call it inside the describe): sets `settings`, starts the
 * isolated app with the spec's fixtures, logs the three users in, and undoes it all afterwards.
 */
export function useFaultsApp<Body>(options: {
  label: string;
  settings: Record<string, string>;
  users: ScopedUsers;
  password: string;
  remove: (dataSource: DataSource) => Promise<void>;
  create: (dataSource: DataSource) => Promise<void>;
}) {
  const { label, settings, users, password, remove, create } = options;
  let started: IsolatedApp | undefined;
  const tokens: ScopedUsers = { admin: '', inScope: '', outOfScope: '' };

  beforeAll(async () => {
    for (const [name, value] of Object.entries(settings)) {
      process.env[name] = value;
    }
    started = await startIsolatedApp(label, { remove, create });
    for (const [key, username] of Object.entries(users)) {
      tokens[key as keyof ScopedUsers] = (
        await request(started.app.getHttpServer())
          .post('/auth/login')
          .send({ username, password })
          .expect(200)
      ).body.access_token as string;
    }
  });

  afterAll(async () => {
    await stopIsolatedApp(started, label, remove);
    for (const name of Object.keys(settings)) delete process.env[name];
  });

  const server = () => started!.app.getHttpServer();
  const get = async (path: string, token = tokens.admin) =>
    (
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body;

  return {
    tokens,
    get,
    faults: (token = tokens.admin) => get('/faults', token) as Promise<Body>,
    resolved: (window = '1h', token = tokens.admin) =>
      get(`/faults/resolved?window=${window}`, token) as Promise<Body>,
    run: (action: string, target: string) =>
      request(server())
        .post('/scenarios')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ action, target }),
    sql: async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
      (await started!.dataSource.query(text, params)) as T[],
  };
}
