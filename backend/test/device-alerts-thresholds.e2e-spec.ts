import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { DeviceAlertThresholds } from '../src/faults/device-alert-thresholds';
import {
  LoadStep,
  insertLoadReadings,
  isoAt,
  overloadExpectation,
  randomWorld,
} from './support/device-alert-fixtures';
import {
  IsolatedApp,
  createSmacNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-245 · NF-22 against a real database: the overload and imbalance thresholds are settings,
// changed without touching the code. Here the API starts with SMAC_OVERLOAD_PERCENT = 80 (the
// NF-22 acceptance test: a transformer at 85 % must now raise the alert, where at the default 90 %
// it does not: see device-alerts.e2e-spec.ts) and SMAC_CURRENT_UNBALANCE_PERCENT = 5, which turns
// the current-imbalance condition on (TD-10 has no approved value, so it is off by default).
// A seeded random world is also checked against the pure rules with these thresholds.

const LABEL = 'SCRUM-245 NF-22 thresholds';
const PASSWORD = randomBytes(18).toString('base64url');
const ADMIN = 'device-alerts-thresholds-e2e-admin@test.local';
const HW = 'DBE2E-';
const NODE = 'DBE2ES0001';
const RANDOM_NODE = 'DBE2ES0100';
const CIRCUIT = 1;

const THRESHOLDS: DeviceAlertThresholds = {
  overloadPercent: 80,
  voltageUnbalancePercent: 2,
  currentUnbalancePercent: 5,
};
const SETTINGS: Record<string, string> = {
  SMAC_OVERLOAD_PERCENT: '80',
  SMAC_VOLTAGE_UNBALANCE_PERCENT: '2',
  SMAC_CURRENT_UNBALANCE_PERCENT: '5',
};

const L = (
  minutes: number,
  load: LoadStep['load'],
  vuf: LoadStep['vuf'],
  cuf: LoadStep['cuf'] = null,
): LoadStep => ({ minutes, load, vuf, cuf });

interface Case {
  suffix: string;
  steps: LoadStep[];
  expect: null | {
    startsAt: number;
    conditions: string[];
    load: number | null;
    cuf: number | null;
  };
}

const CASES: Case[] = [
  // The NF-22 test: 85 % is above 80 %.
  {
    suffix: 'N01',
    steps: [L(30, 85, 1)],
    expect: { startsAt: 30, conditions: ['OVERLOAD'], load: 85, cuf: null },
  },
  // Exactly at the threshold is not above it.
  { suffix: 'N02', steps: [L(30, 80, 1)], expect: null },
  // The current imbalance is now a condition of its own.
  {
    suffix: 'N03',
    steps: [L(30, 50, 1, 6)],
    expect: {
      startsAt: 30,
      conditions: ['CURRENT_UNBALANCE'],
      load: 50,
      cuf: 6,
    },
  },
  { suffix: 'N04', steps: [L(30, 50, 1, 5)], expect: null },
  // The imbalance carries over a reading that does not report it, and an explicit value below the
  // threshold ends it.
  {
    suffix: 'N05',
    steps: [L(60, 50, 1, 6), L(30, 50, 1, null)],
    expect: {
      startsAt: 60,
      conditions: ['CURRENT_UNBALANCE'],
      load: 50,
      cuf: 6,
    },
  },
  { suffix: 'N06', steps: [L(60, 50, 1, 6), L(30, 50, 1, 4)], expect: null },
  // Overload hands over to the current imbalance: one alert from the first.
  {
    suffix: 'N07',
    steps: [L(60, 85, 1), L(40, 85, 1, 6), L(20, 70, 1, 6)],
    expect: {
      startsAt: 60,
      conditions: ['CURRENT_UNBALANCE'],
      load: 70,
      cuf: 6,
    },
  },
  // All three at once.
  {
    suffix: 'N08',
    steps: [L(30, 95, 3, 9)],
    expect: {
      startsAt: 30,
      conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE', 'CURRENT_UNBALANCE'],
      load: 95,
      cuf: 9,
    },
  },
];

const RANDOM = randomWorld(
  20_261_115,
  { transformerNode: RANDOM_NODE, falconNode: 'unused', hwPrefix: HW },
  { transformers: 80, freeFall: 0, solar: 0 },
);

const trafoId = (suffix: string) => `${NODE}-${suffix}`;
const hwOf = (suffix: string) => `${HW}${suffix}`;

async function remove(dataSource: DataSource): Promise<void> {
  const hw = (
    await dataSource.query('SELECT hw_id FROM devices WHERE hw_id LIKE $1', [
      `${HW}%`,
    ])
  ).map((row: { hw_id: string }) => row.hw_id);
  await removeSmacNodes(dataSource, [NODE, RANDOM_NODE], hw);
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN]);
}

async function create(dataSource: DataSource, base: number): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', TRUE)`,
    [ADMIN, hash],
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: NODE,
        transformers: CASES.map((c) => ({
          customId: trafoId(c.suffix),
          hwId: hwOf(c.suffix),
          readings: [],
        })),
      },
      {
        node: RANDOM_NODE,
        transformers: RANDOM.transformers.map((t) => ({
          customId: t.customId,
          hwId: t.hwId,
          readings: [],
        })),
      },
    ],
    CIRCUIT,
  );
  for (const c of CASES) {
    await insertLoadReadings(
      dataSource,
      base,
      hwOf(c.suffix),
      trafoId(c.suffix),
      c.steps,
    );
  }
  for (const t of RANDOM.transformers) {
    await insertLoadReadings(dataSource, base, t.hwId, t.customId, t.steps);
  }
}

interface FaultBody {
  id: string;
  node: string;
  alert_type: string;
  source_id: string | null;
  started_at: string;
  conditions: string[] | null;
  transformer_load: {
    load_percent: number | null;
    vuf_percent: number | null;
    cuf_percent: number | null;
  } | null;
}

describe('GET /faults — configurable overload and imbalance thresholds (SCRUM-245 · NF-22, e2e)', () => {
  let started: IsolatedApp | undefined;
  let base: number;
  let warn: jest.SpyInstance;
  let overloads: Map<string, FaultBody>;
  const previous: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [name, value] of Object.entries(SETTINGS)) {
      previous[name] = process.env[name];
      process.env[name] = value;
    }
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    base = Math.floor(Date.now() / 1000) * 1000;
    started = await startIsolatedApp(LABEL, {
      remove,
      create: (db) => create(db, base),
    });
    const server = started.app.getHttpServer();
    const token = (
      await request(server)
        .post('/auth/login')
        .send({ username: ADMIN, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;
    const body = (
      await request(server)
        .get('/faults')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body as { faults: FaultBody[] };
    overloads = new Map(
      body.faults
        .filter(
          (f) =>
            f.alert_type === 'OVERLOAD_UNBALANCE' && f.node.startsWith('DBE2E'),
        )
        .map((f) => [f.source_id as string, f]),
    );
  });

  afterAll(async () => {
    try {
      await stopIsolatedApp(started, LABEL, remove);
    } finally {
      warn.mockRestore();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('NF-22: with the threshold at 80 %, a transformer at 85 % raises the alert without any code change', () => {
    expect(overloads.get(trafoId('N01'))).toMatchObject({
      conditions: ['OVERLOAD'],
      started_at: isoAt(base, 30),
      transformer_load: { load_percent: 85, vuf_percent: 1, cuf_percent: null },
    });
    expect(overloads.has(trafoId('N02'))).toBe(false); // exactly 80 % is not above it
  });

  it('lists exactly the expected transformers, with their conditions, start and last values', () => {
    expect(
      [...overloads.keys()]
        .filter((id) => id.startsWith(NODE))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(
      CASES.filter((c) => c.expect !== null)
        .map((c) => trafoId(c.suffix))
        .sort((a, b) => a.localeCompare(b)),
    );
    for (const c of CASES.filter((x) => x.expect !== null)) {
      const want = c.expect as NonNullable<Case['expect']>;
      expect(overloads.get(trafoId(c.suffix))).toMatchObject({
        id: `OVERLOAD_UNBALANCE:${trafoId(c.suffix)}:${isoAt(base, want.startsAt)}`,
        conditions: want.conditions,
        transformer_load: expect.objectContaining({
          load_percent: want.load,
          cuf_percent: want.cuf,
        }),
      });
    }
  });

  it('a configured current-imbalance threshold turns that condition on (it is off while unset: TD-10)', () => {
    expect(overloads.get(trafoId('N03'))?.conditions).toEqual([
      'CURRENT_UNBALANCE',
    ]);
    expect(overloads.has(trafoId('N04'))).toBe(false); // exactly 5 % is not above it
    expect(overloads.get(trafoId('N08'))?.conditions).toEqual([
      'OVERLOAD',
      'VOLTAGE_UNBALANCE',
      'CURRENT_UNBALANCE',
    ]);
  });

  it('the SQL agrees with the pure rules, with these thresholds, on a seeded random world', () => {
    let active = 0;
    const conditions = new Set<string>();
    for (const t of RANDOM.transformers) {
      const want = overloadExpectation(base, t.steps, THRESHOLDS);
      const got = overloads.get(t.customId);
      expect({ source: t.customId, active: got !== undefined }).toEqual({
        source: t.customId,
        active: want.active,
      });
      if (!want.active) continue;
      active++;
      want.conditions.forEach((c) => conditions.add(c));
      expect({
        source: t.customId,
        started_at: got?.started_at,
        conditions: got?.conditions,
        load: got?.transformer_load,
      }).toEqual({
        source: t.customId,
        started_at: want.startedAt?.toISOString(),
        conditions: want.conditions,
        load: {
          load_percent: want.lastValues.loadPercent,
          vuf_percent: want.lastValues.voltageUnbalancePercent,
          cuf_percent: want.lastValues.currentUnbalancePercent,
        },
      });
    }
    expect(active).toBeGreaterThan(10);
    expect(active).toBeLessThan(RANDOM.transformers.length);
    expect([...conditions].sort((a, b) => a.localeCompare(b))).toEqual([
      'CURRENT_UNBALANCE',
      'OVERLOAD',
      'VOLTAGE_UNBALANCE',
    ]);
  });
});
