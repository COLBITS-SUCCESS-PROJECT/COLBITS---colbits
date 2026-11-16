import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  LowEnergyAlertDto,
  LowEnergyAlertsResponseDto,
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
    const falcon = lowEnergyThreshold(
      this.configService.get(LOW_ENERGY_SETTINGS.FALCON),
    );
    const smac = lowEnergyThreshold(
      this.configService.get(LOW_ENERGY_SETTINGS.SMAC),
    );
    const envelope = {
      falcon_low_energy_percent: falcon,
      smac_low_energy_percent: smac,
    };

    const nodesQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);
    applyNodeScope(nodesQuery, 'node.name', scope);
    const nodeNames = (await nodesQuery.getMany()).map((node) => node.name);
    if (nodeNames.length === 0) return { ...envelope, count: 0, alerts: [] };

    const rows: LowEnergyRow[] = await this.nodesRepository.query(
      LOW_ENERGY_ALERTS_SQL,
      [nodeNames, falcon, smac],
    );
    const alerts = rows.map(toAlert);
    return { ...envelope, count: alerts.length, alerts };
  }
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
