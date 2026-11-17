import type { InactiveDeviceRow } from '../device/inactive-devices.service';
import {
  toInactivityAlertDto,
  toInactivityAlertDtos,
} from './device-inactivity-alerts';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const HOURS = { falcon: 9, smac: 3 };
const at = (hours: number): string =>
  new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function row(overrides: Partial<InactiveDeviceRow> = {}): InactiveDeviceRow {
  return {
    kind: 'FALCON',
    hw_id: '1301000004',
    source_id: '0000100002-A-R',
    node_id: '0000100002',
    fuses_set_id: 2,
    branch: 'A',
    phase: 'R',
    zone_id: 1,
    zone_name: 'North',
    substation_id: 2,
    substation_code: 'S2',
    substation_name: 'Sub 2',
    circuit_id: 1,
    circuit_name: 'CTO 1',
    last_at: null,
    energy: null,
    gaps: [],
    ...overrides,
  };
}

const smac = (overrides: Partial<InactiveDeviceRow> = {}) =>
  row({
    kind: 'SMAC',
    hw_id: '0501000001',
    source_id: '0000100004-T1-3',
    node_id: '0000100004',
    fuses_set_id: null,
    branch: null,
    phase: null,
    circuit_id: 3,
    circuit_name: 'CTO 3',
    ...overrides,
  });

describe('toInactivityAlertDtos (F-38, F-39, F-46)', () => {
  it('an open period of a Falcon: previous record + 9 h, no end, a fuse-level entry', () => {
    const [alert, ...others] = toInactivityAlertDtos(
      [row({ gaps: [{ from: at(20), next: null }] })],
      HOURS,
      new Date(NOW.getTime() - 3_600_000),
      NOW,
    );

    expect(others).toEqual([]);
    expect(alert).toEqual({
      id: `DEVICE_INACTIVITY:0000100002-A-R:${at(11)}`,
      node: '0000100002',
      circuit: { id: 1, name: 'CTO 1' },
      fuses_set_id: 2,
      branch: 'A',
      alert_type: 'DEVICE_INACTIVITY',
      device: 'FALCON',
      source_id: '0000100002-A-R',
      channel: null,
      channels: null,
      state: 'OPEN',
      phases: ['R'],
      classification: null,
      client_count: null,
      started_at: at(11),
      ended_at: null,
      duration_seconds: 11 * 3600,
      openings: [],
      conditions: null,
      transformer_load: null,
      energy: null,
      warnings: [],
    });
  });

  it('a SMAC is a transformer-level entry with its own 3 h threshold', () => {
    const [alert] = toInactivityAlertDtos(
      [smac({ gaps: [{ from: at(5), next: null }] })],
      HOURS,
      new Date(NOW.getTime() - 3_600_000),
      NOW,
    );

    expect(alert).toMatchObject({
      id: `DEVICE_INACTIVITY:0000100004-T1-3:${at(2)}`,
      device: 'SMAC',
      fuses_set_id: null,
      branch: null,
      phases: null,
      state: 'OPEN',
      started_at: at(2),
      duration_seconds: 2 * 3600,
      client_count: null,
      energy: null,
    });
  });

  it('a gap exactly as long as the threshold is no period; one millisecond more is', () => {
    const exact = new Date(Date.parse(at(20)) + 9 * 3_600_000).toISOString();
    const over = new Date(Date.parse(at(20)) + 9 * 3_600_000 + 1).toISOString();

    expect(
      toInactivityAlertDtos(
        [row({ gaps: [{ from: at(20), next: exact }] })],
        HOURS,
        new Date(NOW.getTime() - 24 * 3_600_000),
        NOW,
      ),
    ).toEqual([]);
    expect(
      toInactivityAlertDtos(
        [row({ gaps: [{ from: at(20), next: over }] })],
        HOURS,
        new Date(NOW.getTime() - 24 * 3_600_000),
        NOW,
      ),
    ).toHaveLength(1);
  });

  it('a resolved period: ended by the next record, same id as while open, duration up to that record', () => {
    const next = at(3);
    const [resolved] = toInactivityAlertDtos(
      [row({ gaps: [{ from: at(20), next }] })],
      HOURS,
      new Date(NOW.getTime() - 24 * 3_600_000),
      NOW,
    );
    const open = toInactivityAlertDtos(
      [row({ gaps: [{ from: at(20), next: null }] })],
      HOURS,
      new Date(NOW.getTime() - 24 * 3_600_000),
      NOW,
    )[0];

    expect(resolved).toEqual(
      Object.assign({}, open, {
        state: 'RESOLVED',
        ended_at: next,
        duration_seconds: 8 * 3600,
      }),
    );
    expect(resolved.id).toBe(open.id);
  });

  it('reads the gaps as the driver returns them: an array or a JSON text', () => {
    const gaps = [{ from: at(20), next: null }];

    expect(
      toInactivityAlertDtos(
        [row({ gaps: JSON.stringify(gaps) })],
        HOURS,
        new Date(NOW.getTime() - 3_600_000),
        NOW,
      ),
    ).toHaveLength(1);
  });

  it('gives one entry per period of a device, and none to a device without a period (never reported)', () => {
    const alerts = toInactivityAlertDtos(
      [
        row({
          gaps: [
            { from: at(40), next: at(25) },
            { from: at(20), next: null },
          ],
        }),
        smac({ gaps: [] }),
      ],
      HOURS,
      new Date(NOW.getTime() - 48 * 3_600_000),
      NOW,
    );

    expect(alerts.map((a) => [a.source_id, a.state])).toEqual([
      ['0000100002-A-R', 'RESOLVED'],
      ['0000100002-A-R', 'OPEN'],
    ]);
  });

  it('does not list a period that ended before the window', () => {
    expect(
      toInactivityAlertDtos(
        [row({ gaps: [{ from: at(40), next: at(25) }] })],
        HOURS,
        new Date(NOW.getTime() - 3_600_000),
        NOW,
      ),
    ).toEqual([]);
  });

  it('uses the thresholds it is given', () => {
    const [alert] = toInactivityAlertDtos(
      [row({ gaps: [{ from: at(20), next: null }] })],
      { falcon: 2, smac: 3 },
      new Date(NOW.getTime() - 3_600_000),
      NOW,
    );

    expect(alert.started_at).toBe(at(18));
  });
});

describe('toInactivityAlertDto', () => {
  it('a Falcon row with no phase gives no phases and the unclassified warning, never a guess', () => {
    const alert = toInactivityAlertDto(
      row({ phase: null }),
      new Date(at(5)),
      null,
      NOW,
    );

    expect(alert.phases).toBeNull();
    expect(alert.warnings).toEqual(['PHASES_UNCLASSIFIED']);
  });
});
