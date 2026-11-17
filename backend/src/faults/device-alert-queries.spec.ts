import {
  LOW_ENERGY_ALERTS_SQL,
  LowEnergyAlertRow,
  RESOLVED_LOW_ENERGY_ALERTS_SQL,
  ResolvedLowEnergyAlertRow,
  toLowEnergyAlertDto,
  toResolvedLowEnergyAlertDto,
} from './device-alert-queries';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const STARTED = '2026-11-14T10:00:00.000Z';
const ENDED = '2026-11-14T11:00:00.000Z';
const THRESHOLDS = { falcon: 30, smac: 40 };

/** An open Falcon low-energy row on fuse 0000100002-A-R unless overridden. */
function falconRow(
  overrides: Partial<LowEnergyAlertRow> = {},
): LowEnergyAlertRow {
  return {
    kind: 'FALCON',
    source_id: '0000100002-A-R',
    node_id: '0000100002',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    fuses_set_id: 2,
    branch: 'A',
    phase: 'R',
    started_at: new Date(STARTED),
    level_percent: 18,
    ...overrides,
  };
}

/** An open SMAC low-energy row on transformer 0000100004-T1-3 unless overridden. */
function smacRow(
  overrides: Partial<LowEnergyAlertRow> = {},
): LowEnergyAlertRow {
  return {
    kind: 'SMAC',
    source_id: '0000100004-T1-3',
    node_id: '0000100004',
    circuit_id: 3,
    circuit_name: 'CTO 3',
    fuses_set_id: null,
    branch: null,
    phase: null,
    started_at: new Date(STARTED),
    level_percent: 22,
    ...overrides,
  };
}

describe('toLowEnergyAlertDto (F-44, F-45)', () => {
  it('Falcon: a fuse-level entry like FREE_FALL, with the fuse set, branch and phase and the energy', () => {
    expect(toLowEnergyAlertDto(falconRow(), THRESHOLDS, NOW)).toEqual({
      id: `LOW_ENERGY:0000100002-A-R:${STARTED}`,
      node: '0000100002',
      circuit: { id: 1, name: 'CTO 1' },
      fuses_set_id: 2,
      branch: 'A',
      alert_type: 'LOW_ENERGY',
      device: 'FALCON',
      source_id: '0000100002-A-R',
      channel: null,
      channels: null,
      state: 'OPEN',
      phases: ['R'],
      classification: null,
      client_count: null,
      started_at: STARTED,
      ended_at: null,
      duration_seconds: 7200,
      openings: [],
      conditions: null,
      transformer_load: null,
      energy: { level_percent: 18, threshold_percent: 30 },
      warnings: [],
    });
  });

  it('SMAC: a transformer-level entry like OVERLOAD_UNBALANCE, with no set, branch or phases', () => {
    expect(toLowEnergyAlertDto(smacRow(), THRESHOLDS, NOW)).toEqual({
      id: `LOW_ENERGY:0000100004-T1-3:${STARTED}`,
      node: '0000100004',
      circuit: { id: 3, name: 'CTO 3' },
      fuses_set_id: null,
      branch: null,
      alert_type: 'LOW_ENERGY',
      device: 'SMAC',
      source_id: '0000100004-T1-3',
      channel: null,
      channels: null,
      state: 'OPEN',
      phases: null,
      classification: null,
      client_count: null,
      started_at: STARTED,
      ended_at: null,
      duration_seconds: 7200,
      openings: [],
      conditions: null,
      transformer_load: null,
      energy: { level_percent: 22, threshold_percent: 40 },
      warnings: [],
    });
  });

  it('the threshold of the entry is the one of its device type', () => {
    expect(
      toLowEnergyAlertDto(falconRow(), { falcon: 55, smac: 11 }, NOW).energy,
    ).toEqual({ level_percent: 18, threshold_percent: 55 });
    expect(
      toLowEnergyAlertDto(smacRow(), { falcon: 55, smac: 11 }, NOW).energy,
    ).toEqual({ level_percent: 22, threshold_percent: 11 });
  });

  it('reads the level and the ids as the driver may return them (text, ISO strings)', () => {
    const dto = toLowEnergyAlertDto(
      falconRow({
        level_percent: '17.5',
        fuses_set_id: '2',
        circuit_id: '1',
        started_at: STARTED,
      }),
      THRESHOLDS,
      NOW,
    );

    expect(dto.energy?.level_percent).toBe(17.5);
    expect(dto.fuses_set_id).toBe(2);
    expect(dto.circuit.id).toBe(1);
  });

  it('keeps the id stable: it depends on the type, the source and the start only', () => {
    const first = toLowEnergyAlertDto(falconRow(), THRESHOLDS, NOW);
    const later = toLowEnergyAlertDto(
      falconRow({ level_percent: 3 }),
      THRESHOLDS,
      new Date(NOW.getTime() + 3_600_000),
    );

    expect(later.id).toBe(first.id);
    expect(
      toLowEnergyAlertDto(
        falconRow({ started_at: new Date(ENDED) }),
        THRESHOLDS,
        NOW,
      ).id,
    ).not.toBe(first.id);
  });

  it('does not guess the phase of a fuse whose phase cannot be classified', () => {
    const dto = toLowEnergyAlertDto(falconRow({ phase: 'X' }), THRESHOLDS, NOW);

    expect(dto.phases).toBeNull();
    expect(dto.warnings).toEqual(['PHASES_UNCLASSIFIED']);
  });
});

describe('toResolvedLowEnergyAlertDto (F-62, F-63)', () => {
  const resolvedRow = (row: LowEnergyAlertRow): ResolvedLowEnergyAlertRow => ({
    ...row,
    ended_at: new Date(ENDED),
  });

  it.each([
    ['Falcon', falconRow(), 'FALCON', 30],
    ['SMAC', smacRow(), 'SMAC', 40],
  ] as const)(
    '%s: the same entry and id as while open, RESOLVED, with the recharge as its end and the last low level',
    (_kind, row, device, threshold) => {
      const open = toLowEnergyAlertDto(row, THRESHOLDS, NOW);
      const resolved = toResolvedLowEnergyAlertDto(
        resolvedRow({ ...row, level_percent: 9 }),
        THRESHOLDS,
      );

      expect(resolved).toEqual(
        Object.assign({}, open, {
          state: 'RESOLVED',
          ended_at: ENDED,
          duration_seconds: 3600,
          energy: { level_percent: 9, threshold_percent: threshold },
        }),
      );
      expect(resolved.device).toBe(device);
      expect(resolved.id).toBe(open.id);
    },
  );
});

describe('low-energy statements', () => {
  const placeholders = (sql: string) =>
    [...new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort(
      (a, b) => a - b,
    );

  it('the active one takes the nodes and the two thresholds only', () => {
    expect(placeholders(LOW_ENERGY_ALERTS_SQL)).toEqual([1, 2, 3]);
  });

  it('the resolved one takes the nodes, the two thresholds and the window', () => {
    expect(placeholders(RESOLVED_LOW_ENERGY_ALERTS_SQL)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it.each([
    ['active', LOW_ENERGY_ALERTS_SQL],
    ['resolved', RESOLVED_LOW_ENERGY_ALERTS_SQL],
  ])(
    '%s: reads the history tables of the current device, never last_* or the clock',
    (_label, sql) => {
      expect(sql).toContain('public.falcon_values');
      expect(sql).toContain('public.smac_vc_values');
      expect(sql).toContain('current_hw_id');
      expect(sql).not.toMatch(/last_falcon_values|last_smac_vc_values/);
      expect(sql).not.toMatch(/now\(\)|clock_timestamp|current_timestamp/i);
      // The same two columns, with the strict comparison of the rule.
      expect(sql).toContain('supercaps_per');
      expect(sql).toContain('battery_per');
      expect(sql).not.toMatch(/<=\s*\$[23]/);
    },
  );
});
