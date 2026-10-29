/**
 * Prepares the database before the API starts, so a fresh deploy (Render) needs no manual steps.
 *  1. Empty database → runs backend/database/01, 02 and 03 (tables, sample rows, users), the same
 *     files Docker runs locally on an empty volume.
 *  2. Telemetry older than DATA_REFRESH_HOURS (default 1) → runs the generator ending "now", so the
 *     map never shows every node as inactive just because the sample data is old.
 * Usage: `node scripts/prepare-db.mjs` (reads DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME;
 * with MAINTENANCE_DB_NAME it also creates DB_NAME when it does not exist).
 * Set PREPARE_DB=false to skip it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(here, '..', 'database');
const SQL_FILES = ['01_create_tables.sql', '02_dummy_inserts.sql', '03_security_schema.sql'];
const GENERATOR_DIR = join(here, '..', '..', 'generator');
const DEFAULT_REFRESH_HOURS = 1;

const env = process.env;

function databaseUrl(name = env.DB_NAME ?? 'colbits') {
  const user = encodeURIComponent(env.DB_USER ?? 'postgres');
  const password = encodeURIComponent(env.DB_PASSWORD ?? '');
  return `postgres://${user}:${password}@${env.DB_HOST ?? 'localhost'}:${env.DB_PORT ?? 5432}/${name}`;
}

/**
 * Creates DB_NAME when it does not exist yet (staging shares the production server, see render.yaml).
 * Connects to MAINTENANCE_DB_NAME, a database that already exists on the server.
 */
async function ensureDatabase() {
  const name = env.DB_NAME ?? 'colbits';
  const maintenance = env.MAINTENANCE_DB_NAME;
  if (!maintenance || maintenance === name) return;

  const admin = new pg.Client({ connectionString: databaseUrl(maintenance) });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      console.log(`[prepare-db] creating database ${name}`);
      await admin.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    }
  } finally {
    await admin.end();
  }
}

async function hasTables(client) {
  const { rows } = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS ok");
  return rows[0].ok;
}

/**
 * One transaction, so a failure never leaves half a schema behind. 01 empties the search_path
 * (pg_dump style); psql gets a new session per file, here it is reset before each one.
 */
async function createSchema(client) {
  await client.query('BEGIN');
  try {
    for (const file of SQL_FILES) {
      console.log(`[prepare-db] running ${file}`);
      await client.query('SET search_path TO public');
      await client.query(readFileSync(join(SQL_DIR, file), 'utf8'));
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/** Hours since the newest Falcon record, or Infinity when there is none. */
async function dataAgeHours(client) {
  const { rows } = await client.query('SELECT max(recorded_at) AS newest FROM public.last_falcon_values');
  const newest = rows[0].newest;
  return newest ? (Date.now() - new Date(newest).getTime()) / 3_600_000 : Infinity;
}

function runGenerator(url) {
  const end = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  console.log(`[prepare-db] generating fresh data ending ${end}`);
  execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', 'src/cli.ts', '--db', url, '--reset', '--end', end, '--silent-devices', '6'],
    { cwd: GENERATOR_DIR, stdio: 'inherit' },
  );
}

async function main() {
  if (env.PREPARE_DB === 'false') return;

  await ensureDatabase();
  const url = databaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (!(await hasTables(client))) await createSchema(client);

    const refreshHours = Number(env.DATA_REFRESH_HOURS) > 0 ? Number(env.DATA_REFRESH_HOURS) : DEFAULT_REFRESH_HOURS;
    const age = await dataAgeHours(client);
    if (age > refreshHours) runGenerator(url);
    else console.log(`[prepare-db] data is ${age.toFixed(1)} h old, no refresh needed`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Never block the API: if this fails, the app still starts with whatever data there is.
  console.error('[prepare-db] skipped:', error.message);
});
