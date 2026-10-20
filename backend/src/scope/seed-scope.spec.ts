import { readFileSync } from 'fs';
import { join } from 'path';

const DATABASE_DIR = join(__dirname, '..', '..', 'database');

function readSql(file: string): string {
  return readFileSync(join(DATABASE_DIR, file), 'utf8').replace(/--.*$/gm, '');
}

/** Rows of `INSERT INTO <table> (...) VALUES (...), (...);` as arrays of unquoted fields. */
function seedRows(sql: string, table: string): string[][] {
  const statement = new RegExp(
    `INSERT INTO ${table}\\s*\\([^)]*\\)\\s*VALUES([^;]*);`,
    'i',
  ).exec(sql);

  if (!statement) {
    throw new Error(`No INSERT INTO ${table} found in the seed files`);
  }

  const rows = [...statement[1].matchAll(/\(([^()]*)\)/g)].map((tuple) =>
    tuple[1].split(',').map((field) => field.trim().replace(/^'|'$/g, '')),
  );

  if (rows.length === 0) {
    throw new Error(`INSERT INTO ${table} has no rows`);
  }

  return rows;
}

describe('seeded user_scopes (backend/database)', () => {
  const data = readSql('02_dummy_inserts.sql');
  const security = readSql('03_security_schema.sql');

  const zones = seedRows(data, 'zones').map(([id]) => id);
  const substations = seedRows(data, 'substations').map(([id]) => id);
  const circuits = seedRows(data, 'circuits').map(([id, name]) => ({
    id,
    name,
  }));
  const nodes = seedRows(data, 'nodes').map(([name]) => name);
  const scopes = seedRows(security, 'user_scopes').map(
    ([userId, entityType, entityId]) => ({ userId, entityType, entityId }),
  );

  const idsByType: Record<string, string[]> = {
    zone: zones,
    substation: substations,
    circuit: circuits.map((circuit) => circuit.id),
    node: nodes,
  };

  it('assigns every scope to an entity that exists, by the identifier the scope query matches', () => {
    for (const scope of scopes) {
      expect({
        type: scope.entityType,
        id: scope.entityId,
        exists: idsByType[scope.entityType]?.includes(scope.entityId),
      }).toEqual({
        type: scope.entityType,
        id: scope.entityId,
        exists: true,
      });
    }
  });

  it('does not identify a circuit by a name that more than one circuit uses', () => {
    const ambiguousNames = circuits
      .map((circuit) => circuit.name)
      .filter((name, _, all) => all.filter((n) => n === name).length > 1);

    // The seed deliberately repeats a circuit name at different substations.
    expect(ambiguousNames.length).toBeGreaterThan(0);

    const circuitScopes = scopes.filter(
      (scope) => scope.entityType === 'circuit',
    );

    expect(circuitScopes.length).toBeGreaterThan(0);

    for (const scope of circuitScopes) {
      expect(ambiguousNames).not.toContain(scope.entityId);
    }
  });
});
