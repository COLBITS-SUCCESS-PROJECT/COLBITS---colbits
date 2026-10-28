import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import { InactivityResultDto } from './dto/inactivity-result.dto';

const FALCON_RECORD_SQL = `
  SELECT fs.node_id
  FROM public.fuses f
  JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
  WHERE f.current_hw_id = $1
  LIMIT 1
`;

const SMAC_RECORD_SQL = `
  SELECT t.node_id
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
    hoursSinceLastRecord: number,
    scope: ScopeContext,
  ): Promise<InactivityResultDto> {
    if (!Number.isFinite(hoursSinceLastRecord) || hoursSinceLastRecord < 0) {
      throw new BadRequestException(
        'lastTimestamp must be a non-negative number of hours',
      );
    }

    if (scope.kind === 'empty') {
      throw new NotFoundException('Device not found');
    }

    const sql = deviceType === 'Falcon' ? FALCON_RECORD_SQL : SMAC_RECORD_SQL;
    const rows: { node_id: string }[] = await this.nodesRepository.query(sql, [
      deviceId,
    ]);

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

    const lastRecordTime = Date.now() - hoursSinceLastRecord * 60 * 60 * 1000;
    const lastRecordTimestamp = new Date(lastRecordTime);
    if (
      !Number.isFinite(lastRecordTime) ||
      Number.isNaN(lastRecordTimestamp.getTime())
    ) {
      throw new BadRequestException(
        'lastTimestamp is outside the supported date range',
      );
    }

    return {
      deviceId,
      deviceType,
      lastRecordTimestamp,
      thresholdHours,
      hoursSilent: parseFloat(hoursSinceLastRecord.toFixed(2)),
      isInactive: hoursSinceLastRecord > thresholdHours,
    };
  }

  private hoursFromConfig(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}
