import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';

export interface InactivityResult {
  deviceId: string;
  deviceType: 'Falcon' | 'SMAC';
  lastRecordTimestamp: Date | null;
  thresholdHours: number;
  hoursSilent: number | null;
  isInactive: boolean;
}

const FALCON_RECORD_SQL = `
  SELECT fs.node_id, l.recorded_at
  FROM public.fuses f
  JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  WHERE f.current_hw_id = $1
  LIMIT 1
`;

const SMAC_RECORD_SQL = `
  SELECT t.node_id,
         GREATEST(
           (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = t.current_hw_id),
           (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = t.current_hw_id),
           (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = t.current_hw_id)
         ) AS recorded_at
  FROM public.trafos t
  WHERE t.current_hw_id = $1
  LIMIT 1
`;

@Injectable()
export class DeviceService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
  ) {}

  async checkInactivity(
    deviceId: string,
    deviceType: 'Falcon' | 'SMAC',
    scope: ScopeContext,
  ): Promise<InactivityResult> {
    if (scope.kind === 'empty') {
      throw new NotFoundException('Device not found');
    }

    const sql = deviceType === 'Falcon' ? FALCON_RECORD_SQL : SMAC_RECORD_SQL;
    const rows: { node_id: string; recorded_at: Date | string | null }[] =
      await this.nodesRepository.query(sql, [deviceId]);

    if (rows.length === 0) {
      throw new NotFoundException('Device not found');
    }

    const row = rows[0];

    const scopeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .where('node.name = :nodeName', { nodeName: row.node_id });

    applyNodeScope(scopeQuery, 'node.name', scope);

    const inScopeCount = await scopeQuery.getCount();
    if (inScopeCount === 0) {
      throw new NotFoundException('Device not found');
    }

    const thresholdHours =
      deviceType === 'Falcon'
        ? this.hoursFromConfig('FALCON_INACTIVITY_HOURS', 9)
        : this.hoursFromConfig('SMAC_INACTIVITY_HOURS', 3);

    const rawTimestamp = row.recorded_at ?? null;
    if (!rawTimestamp) {
      return {
        deviceId,
        deviceType,
        lastRecordTimestamp: null,
        thresholdHours,
        hoursSilent: null,
        isInactive: true,
      };
    }

    const lastDate = new Date(rawTimestamp);
    const diffHours = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60);

    return {
      deviceId,
      deviceType,
      lastRecordTimestamp: lastDate,
      thresholdHours,
      hoursSilent: parseFloat(diffHours.toFixed(2)),
      isInactive: diffHours > thresholdHours,
    };
  }

  private hoursFromConfig(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}