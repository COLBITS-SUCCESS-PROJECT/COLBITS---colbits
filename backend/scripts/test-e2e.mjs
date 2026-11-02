/**
 * Runs the e2e tests against the throwaway PostgreSQL of docker-compose.e2e.yml and removes it.
 * The specs refuse any other database: most need colbits_f10_test and seed-scope needs
 * colbits_scope_seed_test, so there are two Jest runs, both with backend/database/01, 02 and 03.
 * The values below override backend/.env. Usage: `npm run test:e2e` (needs Docker).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_DIR = join(BACKEND_DIR, 'database');
const SQL_FILES = ['01_create_tables.sql', '02_dummy_inserts.sql', '03_security_schema.sql'];
const COMPOSE = ['compose', '-f', 'docker-compose.e2e.yml'];
const JEST = join(BACKEND_DIR, 'node_modules', 'jest', 'bin', 'jest.js');

const ISOLATED_DB = 'colbits_f10_test';
const SEED_DB = 'colbits_scope_seed_test';
const SEED_SPEC = 'seed-scope';

const TEST_ENV = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '55432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'e2e-only',
  FALCON_INACTIVITY_HOURS: '9',
  SMAC_INACTIVITY_HOURS: '3',
};

/** Jest only loads the ESM build of NestJS from this version on (the Dockerfile and CI use 24). */
function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 24 || (major === 24 && minor >= 9)) return;
  console.error(
    `[test-e2e] needs Node 24.9 or newer and this is ${process.version}. ` +
      'Without installing it: npx -y -p node@24 npm run test:e2e',
  );
  process.exit(1);
}

function docker(...args) {
  const { status, error } = spawnSync('docker', [...COMPOSE, ...args], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
  });
  if (error || status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${error?.message ?? `exit code ${status}`}`);
  }
}

async function withClient(database, work) {
  const client = new pg.Client({
    host: TEST_ENV.DB_HOST,
    port: Number(TEST_ENV.DB_PORT),
    user: TEST_ENV.DB_USER,
    password: TEST_ENV.DB_PASSWORD,
    database,
  });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

/** 01 empties the search_path (pg_dump style), so it is reset before each file (as prepare-db.mjs). */
async function createDatabases() {
  await withClient('postgres', (client) => client.query(`CREATE DATABASE ${ISOLATED_DB}`));
  await withClient(ISOLATED_DB, async (client) => {
    for (const file of SQL_FILES) {
      await client.query('SET search_path TO public');
      await client.query(readFileSync(join(SQL_DIR, file), 'utf8'));
    }
  });
  await withClient('postgres', (client) =>
    client.query(`CREATE DATABASE ${SEED_DB} TEMPLATE ${ISOLATED_DB}`),
  );
}

function jest(database, selection) {
  const { status } = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', JEST, '--config', './test/jest-e2e.json', '--runInBand', selection],
    {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, ...TEST_ENV, DB_NAME: database },
    },
  );
  return status ?? 1;
}

async function main() {
  assertNodeVersion();
  let exitCode = 1;
  try {
    docker('up', '--detach', '--wait');
    await createDatabases();
    const isolated = jest(ISOLATED_DB, `--testPathIgnorePatterns=${SEED_SPEC}`);
    const seed = jest(SEED_DB, `--testPathPatterns=${SEED_SPEC}`);
    exitCode = isolated || seed;
  } catch (error) {
    console.error('[test-e2e]', error.message);
  } finally {
    docker('down', '--volumes');
  }
  process.exit(exitCode);
}

await main();
