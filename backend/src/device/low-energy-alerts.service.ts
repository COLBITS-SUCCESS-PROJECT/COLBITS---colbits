import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import type { ResolvedWindow } from '../faults/dto/faults.dto';
import {
  LowEnergyAlertDto,
  LowEnergyAlertsResponseDto,
  ResolvedLowEnergyAlertDto,
  ResolvedLowEnergyAlertsResponseDto,
} from './dto/low-energy-alerts.dto';
import {
  DeviceKind,
  LOW_ENERGY_SETTINGS,
  lowEnergyThreshold,
} from './low-energy';

/**
 * Active low-energy alerts (F-44 Falcon supercapacitors, F-45 SMAC battery; Scope v6.0 §3.2).
 * A device has an active alert while its LATEST stored reading is below its threshold ($2 Falcon,
 * $3 SMAC, NF-08): a reading below raises it, a reading at or above it clears it. `since` is the
 * first reading of the current low streak (after the last reading at or above the threshold).
 * Only devices of the in-scope nodes ($1) are read.
 */
export const LOW_ENERGY_ALERTS_SQL = `
  WITH low AS (
    SELECT 'FALCON'::text AS kind, f.current_hw_id AS hw_id, f.custom_id AS source_id, fs.node_id,
           l.supercaps_per::float8 AS energy, l.recorded_at, $2::float8 AS threshold,
           (SELECT min(v.recorded_at) FROM public.falcon_values v
             WHERE v.hw_id = f.current_hw_id
               AND v.recorded_at > COALESCE(
                 (SELECT max(o.recorded_at) FROM public.falcon_values o
                   WHERE o.hw_id = f.current_hw_id AND o.supercaps_per >= $2::float8),
                 '-infinity'::timestamptz)) AS since
    FROM public.fuses f
    JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
    JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
    WHERE fs.node_id = ANY($1) AND l.supercaps_per < $2::float8
    UNION ALL
    SELECT 'SMAC'::text, t.current_hw_id, t.custom_id, t.node_id,
           l.battery_per::float8, l.recorded_at, $3::float8,
           (SELECT min(v.recorded_at) FROM public.smac_vc_values v
             WHERE v.hw_id = t.current_hw_id
               AND v.recorded_at > COALESCE(
                 (SELECT max(o.recorded_at) FROM public.smac_vc_values o
                   WHERE o.hw_id = t.current_hw_id AND o.battery_per >= $3::float8),
                 '-infinity'::timestamptz))
    FROM public.trafos t
    JOIN public.last_smac_vc_values l ON l.hw_id = t.current_hw_id
    WHERE t.node_id = ANY($1) AND l.battery_per < $3::float8
  )
  SELECT low.*, z.id AS zone_id, z.name AS zone_name,
         s.id AS substation_id, s.code AS substation_code, s.name AS substation_name,
         c.id AS circuit_id, c.name AS circuit_name
  FROM low
  JOIN public.nodes n ON n.name = low.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.zones z ON z.id = s.zone_id
  ORDER BY low.energy ASC, low.since ASC, low.hw_id ASC
`;

/**
 * Resolved low-energy episodes (F-44, F-45): a run of readings below the threshold that ended with
 * a reading at or above it. The same rule as the active alert, read over the history of each
 * device: `since` is the first low reading of the run, `ended_at` the first reading back at or above
 * the threshold, `lowest` the lowest level of the run. Only the episodes that ended in the last $4
 * hours are listed. The readings are read from $4 + RESOLVED_LOOKBACK_HOURS hours back, so a run that
 * began earlier than that starts at the first reading read.
 * $1 in-scope nodes, $2 Falcon threshold, $3 SMAC threshold, $4 window in hours, $5 lookback hours.
 */
export const LOW_ENERGY_RESOLVED_SQL = `
  WITH readings AS (
    SELECT 'FALCON'::text AS kind, f.current_hw_id AS hw_id, f.custom_id AS source_id,
           fs.node_id, v.recorded_at, v.supercaps_per::float8 AS energy, $2::float8 AS threshold
    FROM public.fuses f
    JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
    JOIN public.falcon_values v ON v.hw_id = f.current_hw_id
    WHERE fs.node_id = ANY($1) AND v.supercaps_per IS NOT NULL
      AND v.recorded_at >= now() - ($4::float8 + $5::float8) * interval '1 hour'
    UNION ALL
    SELECT 'SMAC'::text, t.current_hw_id, t.custom_id, t.node_id, v.recorded_at,
           v.battery_per::float8, $3::float8
    FROM public.trafos t
    JOIN public.smac_vc_values v ON v.hw_id = t.current_hw_id
    WHERE t.node_id = ANY($1) AND v.battery_per IS NOT NULL
      AND v.recorded_at >= now() - ($4::float8 + $5::float8) * interval '1 hour'
  ), flagged AS (
    SELECT r.*, (r.energy < r.threshold) AS low,
           lag(r.energy < r.threshold) OVER w AS prev_low,
           lead(r.energy < r.threshold) OVER w AS next_low,
           lead(r.recorded_at) OVER w AS next_at
    FROM readings r
    WINDOW w AS (PARTITION BY r.hw_id ORDER BY r.recorded_at)
  ), runs AS (
    SELECT f.*, sum((f.low AND f.prev_low IS NOT TRUE)::int)
             OVER (PARTITION BY f.hw_id ORDER BY f.recorded_at) AS run_id
    FROM flagged f
  ), episodes AS (
    SELECT kind, hw_id, source_id, node_id, threshold, run_id,
           min(recorded_at) AS since, min(energy) AS lowest,
           max(next_at) FILTER (WHERE next_low IS FALSE) AS ended_at
    FROM runs
    WHERE low
    GROUP BY kind, hw_id, source_id, node_id, threshold, run_id
  )
  SELECT e.kind, e.hw_id, e.source_id, e.node_id, e.threshold, e.since, e.lowest, e.ended_at,
         z.id AS zone_id, z.name AS zone_name,
         s.id AS substation_id, s.code AS substation_code, s.name AS substation_name,
         c.id AS circuit_id, c.name AS circuit_name
  FROM episodes e
  JOIN public.nodes n ON n.name = e.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.zones z ON z.id = s.zone_id
  WHERE e.ended_at IS NOT NULL AND e.ended_at >= now() - $4::float8 * interval '1 hour'
  ORDER BY e.ended_at DESC, e.hw_id ASC
`;

/** How much history before the window the resolved query reads to find where a run began. */
export const RESOLVED_LOOKBACK_HOURS = 168;

/** Hours of each window of GET /device/low-energy/resolved (the same names as GET /faults/resolved). */
export const RESOLVED_WINDOW_HOURS: Readonly<Record<ResolvedWindow, number>> = {
  '1h': 1,
  '24h': 24,
  '1d': 24,
};

interface ResolvedLowEnergyRow {
  kind: DeviceKind;
  hw_id: string;
  source_id: string;
  node_id: string;
  threshold: number | string;
  since: Date | string;
  lowest: number | string;
  ended_at: Date | string;
  zone_id: number | string;
  zone_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
  circuit_id: number | string;
  circuit_name: string;
}

interface LowEnergyRow {
  kind: DeviceKind;
  hw_id: string;
  source_id: string;
  node_id: string;
  energy: number | string;
  threshold: number | string;
  recorded_at: Date | string;
  since: Date | string | null;
  zone_id: number | string;
  zone_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
  circuit_id: number | string;
  circuit_name: string;
}

/** US17 / Scope §3.2 · F-44, F-45: active low-energy alerts of the user scope. */
@Injectable()
export class LowEnergyAlertsService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}

  async activeAlerts(scope: ScopeContext): Promise<LowEnergyAlertsResponseDto> {
    const { falcon, smac, envelope } = this.thresholds();
    const nodeNames = await this.nodeNamesInScope(scope);
    if (nodeNames.length === 0) return { ...envelope, count: 0, alerts: [] };

    const rows: LowEnergyRow[] = await this.nodesRepository.query(
      LOW_ENERGY_ALERTS_SQL,
      [nodeNames, falcon, smac],
    );
    const alerts = rows.map(toAlert);
    return { ...envelope, count: alerts.length, alerts };
  }

  /**
   * Low-energy episodes that ended inside the window (newest end first): the history behind the
   * Resolved tab. Derived from the stored readings with the active-alert rule, so a device that
   * recharged above its threshold moves from the active list to here.
   */
  async resolvedAlerts(
    scope: ScopeContext,
    window: ResolvedWindow,
  ): Promise<ResolvedLowEnergyAlertsResponseDto> {
    const { falcon, smac, envelope } = this.thresholds();
    const nodeNames = await this.nodeNamesInScope(scope);
    if (nodeNames.length === 0) return { ...envelope, count: 0, alerts: [] };

    const rows: ResolvedLowEnergyRow[] = await this.nodesRepository.query(
      LOW_ENERGY_RESOLVED_SQL,
      [
        nodeNames,
        falcon,
        smac,
        RESOLVED_WINDOW_HOURS[window],
        RESOLVED_LOOKBACK_HOURS,
      ],
    );
    const alerts = rows.map(toResolvedAlert);
    return { ...envelope, count: alerts.length, alerts };
  }

  private thresholds() {
    const falcon = lowEnergyThreshold(
      this.configService.get(LOW_ENERGY_SETTINGS.FALCON),
    );
    const smac = lowEnergyThreshold(
      this.configService.get(LOW_ENERGY_SETTINGS.SMAC),
    );
    return {
      falcon,
      smac,
      envelope: {
        falcon_low_energy_percent: falcon,
        smac_low_energy_percent: smac,
      },
    };
  }

  private async nodeNamesInScope(scope: ScopeContext): Promise<string[]> {
    const nodesQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);
    applyNodeScope(nodesQuery, 'node.name', scope);
    return (await nodesQuery.getMany()).map((node) => node.name);
  }
}

function toResolvedAlert(row: ResolvedLowEnergyRow): ResolvedLowEnergyAlertDto {
  return {
    alert_type: 'LOW_ENERGY',
    kind: row.kind,
    hw_id: row.hw_id,
    source_id: row.source_id,
    node: row.node_id,
    zone: { id: Number(row.zone_id), name: row.zone_name },
    substation: {
      id: Number(row.substation_id),
      code: row.substation_code,
      name: row.substation_name,
    },
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
    lowest_energy_percent: Number(row.lowest),
    threshold_percent: Number(row.threshold),
    since: new Date(row.since).toISOString(),
    ended_at: new Date(row.ended_at).toISOString(),
  };
}

function toAlert(row: LowEnergyRow): LowEnergyAlertDto {
  const recordedAt = new Date(row.recorded_at).toISOString();
  return {
    alert_type: 'LOW_ENERGY',
    kind: row.kind,
    hw_id: row.hw_id,
    source_id: row.source_id,
    node: row.node_id,
    zone: { id: Number(row.zone_id), name: row.zone_name },
    substation: {
      id: Number(row.substation_id),
      code: row.substation_code,
      name: row.substation_name,
    },
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
    energy_percent: Number(row.energy),
    threshold_percent: Number(row.threshold),
    recorded_at: recordedAt,
    // The latest reading is itself low, so a streak always exists; it falls back to that reading.
    since: row.since === null ? recordedAt : new Date(row.since).toISOString(),
  };
}
