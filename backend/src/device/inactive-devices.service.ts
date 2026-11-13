import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  InactiveDeviceDto,
  InactiveDevicesResponseDto,
} from './dto/inactive-devices.dto';
import {
  RecordGap,
  compareInactiveDevices,
  inactivityPeriods,
  isInactiveNow,
} from './inactivity-periods';
import {
  DeviceKind,
  LOW_ENERGY_SETTINGS,
  isLowEnergy,
  lowEnergyThreshold,
} from './low-energy';

/** Default window of the list (the panel offers "last hour" and "last day") and its upper limit. */
export const DEFAULT_WINDOW_HOURS = 24;
export const MAX_WINDOW_HOURS = 30 * 24;

/**
 * One row per device installed on the in-scope nodes ($1), with its location, latest record, latest
 * energy level and the gaps between consecutive records that are longer than its threshold.
 * Records are read inside the window [$2, $3] plus the last one before it, so a silence that began
 * before the window is still seen. A SMAC record is a record in any of its three tables (TD-07).
 * $4 / $5: Falcon / SMAC thresholds in hours. Every time is a stored timestamp (F-46).
 */
export const INACTIVE_DEVICES_SQL = `
  WITH dev AS (
    SELECT 'FALCON'::text AS kind, f.current_hw_id AS hw_id, f.custom_id AS source_id, fs.node_id
    FROM public.fuses f
    JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
    WHERE fs.node_id = ANY($1) AND f.current_hw_id IS NOT NULL
    UNION ALL
    SELECT 'SMAC'::text, t.current_hw_id, t.custom_id, t.node_id
    FROM public.trafos t
    WHERE t.node_id = ANY($1) AND t.current_hw_id IS NOT NULL
  ),
  rec AS (
    SELECT d.hw_id, r.recorded_at
    FROM dev d
    CROSS JOIN LATERAL (
      SELECT v.recorded_at FROM public.falcon_values v
       WHERE d.kind = 'FALCON' AND v.hw_id = d.hw_id
         AND v.recorded_at >= $2::timestamptz AND v.recorded_at <= $3::timestamptz
      UNION
      SELECT v.recorded_at FROM public.smac_vc_values v
       WHERE d.kind = 'SMAC' AND v.hw_id = d.hw_id
         AND v.recorded_at >= $2::timestamptz AND v.recorded_at <= $3::timestamptz
      UNION
      SELECT v.recorded_at FROM public.smac_pw_values v
       WHERE d.kind = 'SMAC' AND v.hw_id = d.hw_id
         AND v.recorded_at >= $2::timestamptz AND v.recorded_at <= $3::timestamptz
      UNION
      SELECT v.recorded_at FROM public.smac_pf_values v
       WHERE d.kind = 'SMAC' AND v.hw_id = d.hw_id
         AND v.recorded_at >= $2::timestamptz AND v.recorded_at <= $3::timestamptz
      UNION
      SELECT b.recorded_at FROM (
        SELECT CASE WHEN d.kind = 'FALCON' THEN
                 (SELECT max(recorded_at) FROM public.falcon_values
                   WHERE hw_id = d.hw_id AND recorded_at < $2::timestamptz)
               ELSE GREATEST(
                 (SELECT max(recorded_at) FROM public.smac_vc_values
                   WHERE hw_id = d.hw_id AND recorded_at < $2::timestamptz),
                 (SELECT max(recorded_at) FROM public.smac_pw_values
                   WHERE hw_id = d.hw_id AND recorded_at < $2::timestamptz),
                 (SELECT max(recorded_at) FROM public.smac_pf_values
                   WHERE hw_id = d.hw_id AND recorded_at < $2::timestamptz))
               END AS recorded_at
      ) b WHERE b.recorded_at IS NOT NULL
    ) r
  ),
  gaps AS (
    SELECT hw_id, recorded_at AS from_at,
           LEAD(recorded_at) OVER (PARTITION BY hw_id ORDER BY recorded_at) AS next_at
    FROM rec
  )
  SELECT d.kind, d.hw_id, d.source_id, d.node_id,
         z.id AS zone_id, z.name AS zone_name,
         s.id AS substation_id, s.code AS substation_code, s.name AS substation_name,
         c.id AS circuit_id, c.name AS circuit_name,
         l.last_at, l.energy,
         COALESCE(
           json_agg(json_build_object('from', g.from_at, 'next', g.next_at) ORDER BY g.from_at)
             FILTER (WHERE g.hw_id IS NOT NULL),
           '[]'
         ) AS gaps
  FROM dev d
  JOIN public.nodes n ON n.name = d.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.zones z ON z.id = s.zone_id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN d.kind = 'FALCON' THEN
             (SELECT recorded_at FROM public.last_falcon_values WHERE hw_id = d.hw_id)
           ELSE GREATEST(
             (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = d.hw_id),
             (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = d.hw_id),
             (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = d.hw_id))
           END AS last_at,
           CASE WHEN d.kind = 'FALCON' THEN
             (SELECT supercaps_per FROM public.last_falcon_values WHERE hw_id = d.hw_id)
           ELSE
             (SELECT battery_per FROM public.last_smac_vc_values WHERE hw_id = d.hw_id)
           END AS energy
  ) l
  LEFT JOIN gaps g
    ON g.hw_id = d.hw_id
   AND COALESCE(g.next_at, $3::timestamptz) - g.from_at
       > (CASE d.kind WHEN 'FALCON' THEN $4::float8 ELSE $5::float8 END) * interval '1 hour'
  GROUP BY d.kind, d.hw_id, d.source_id, d.node_id, z.id, z.name, s.id, s.code, s.name,
           c.id, c.name, l.last_at, l.energy
`;

interface InactiveDeviceRow {
  kind: DeviceKind;
  hw_id: string;
  source_id: string;
  node_id: string;
  zone_id: number | string;
  zone_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
  circuit_id: number | string;
  circuit_name: string;
  last_at: Date | string | null;
  energy: number | string | null;
  gaps: { from: string; next: string | null }[] | string;
}

/** US17 · F-38, F-39, F-40 (+ NF-08): inactive devices of the user scope with their inactivity alarms. */
@Injectable()
export class InactiveDevicesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}

  async inactiveDevices(
    scope: ScopeContext,
    windowHours: number = DEFAULT_WINDOW_HOURS,
    now: Date = new Date(),
  ): Promise<InactiveDevicesResponseDto> {
    const from = new Date(now.getTime() - windowHours * 3_600_000);
    const thresholds = {
      falcon_inactivity_hours: this.hours('FALCON_INACTIVITY_HOURS', 9),
      smac_inactivity_hours: this.hours('SMAC_INACTIVITY_HOURS', 3),
      falcon_low_energy_percent: lowEnergyThreshold(
        this.configService.get(LOW_ENERGY_SETTINGS.FALCON),
      ),
      smac_low_energy_percent: lowEnergyThreshold(
        this.configService.get(LOW_ENERGY_SETTINGS.SMAC),
      ),
    };
    const envelope = {
      from: from.toISOString(),
      to: now.toISOString(),
      thresholds,
    };

    // Scope in SQL, as every other endpoint (F-10): only the user's nodes are read.
    const nodesQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);
    applyNodeScope(nodesQuery, 'node.name', scope);
    const nodeNames = (await nodesQuery.getMany()).map((node) => node.name);
    if (nodeNames.length === 0) return { ...envelope, count: 0, devices: [] };

    const rows: InactiveDeviceRow[] = await this.nodesRepository.query(
      INACTIVE_DEVICES_SQL,
      [
        nodeNames,
        from.toISOString(),
        now.toISOString(),
        thresholds.falcon_inactivity_hours,
        thresholds.smac_inactivity_hours,
      ],
    );

    const devices = rows
      .map((row) => toDevice(row, thresholds, from, now))
      .filter((device) => device.periods.length > 0 || device.inactive_now)
      .sort((a, b) => compareInactiveDevices(orderKey(a), orderKey(b)));

    return { ...envelope, count: devices.length, devices };
  }

  /** Same rule as the other services: a positive number of hours from the config, or the default. */
  private hours(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}

function toDevice(
  row: InactiveDeviceRow,
  thresholds: InactiveDevicesResponseDto['thresholds'],
  from: Date,
  now: Date,
): InactiveDeviceDto {
  const falcon = row.kind === 'FALCON';
  const thresholdHours = falcon
    ? thresholds.falcon_inactivity_hours
    : thresholds.smac_inactivity_hours;
  const lastRecordAt = row.last_at === null ? null : new Date(row.last_at);
  const rawGaps =
    typeof row.gaps === 'string' ? JSON.parse(row.gaps) : row.gaps;
  const gaps: RecordGap[] = (
    rawGaps as { from: string; next: string | null }[]
  ).map((gap) => ({
    from: new Date(gap.from),
    next: gap.next === null ? null : new Date(gap.next),
  }));
  const energy = row.energy === null ? null : Number(row.energy);

  return {
    hw_id: row.hw_id,
    source_id: row.source_id,
    kind: row.kind,
    node: row.node_id,
    zone: { id: Number(row.zone_id), name: row.zone_name },
    substation: {
      id: Number(row.substation_id),
      code: row.substation_code,
      name: row.substation_name,
    },
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
    threshold_hours: thresholdHours,
    last_record_at: lastRecordAt?.toISOString() ?? null,
    inactive_now: isInactiveNow(lastRecordAt, thresholdHours, now),
    energy_percent: energy,
    low_energy: isLowEnergy(
      energy,
      falcon
        ? thresholds.falcon_low_energy_percent
        : thresholds.smac_low_energy_percent,
    ),
    periods: inactivityPeriods(gaps, thresholdHours, from, now).map((p) => ({
      start: p.start.toISOString(),
      end: p.end?.toISOString() ?? null,
    })),
  };
}

const orderKey = (device: InactiveDeviceDto) => ({
  hwId: device.hw_id,
  inactiveNow: device.inactive_now,
  lastRecordAt:
    device.last_record_at === null ? null : new Date(device.last_record_at),
  periods: device.periods.map((p) => ({
    start: new Date(p.start),
    end: p.end === null ? null : new Date(p.end),
  })),
});
