import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SEVERITY_WEIGHTS, SeverityWeights } from './fault-ordering';

export const DEFAULT_FAULT_GROUPING_WINDOW_MINUTES = 5;

@Injectable()
export class FaultsService {
  constructor(private readonly configService: ConfigService) {}

  /** US10 · NF-09: grouping window in minutes, configurable without code changes. */
  getGroupingWindowMinutes(): number {
    const configured = Number(
      this.configService.get('FAULT_GROUPING_WINDOW_MINUTES'),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_FAULT_GROUPING_WINDOW_MINUTES;
  }

  /** US15 · NF-11 (SCRUM-238): severity weights configurable via env without code changes. */
  getSeverityWeights(): SeverityWeights {
    return {
      fuseAlarm: this.weightFromConfig(
        'SEVERITY_WEIGHT_FUSE_ALARM',
        DEFAULT_SEVERITY_WEIGHTS.fuseAlarm,
      ),
      voltageAlarm: this.weightFromConfig(
        'SEVERITY_WEIGHT_VOLTAGE_ALARM',
        DEFAULT_SEVERITY_WEIGHTS.voltageAlarm,
      ),
      droppedPhase: this.weightFromConfig(
        'SEVERITY_WEIGHT_DROPPED_PHASE',
        DEFAULT_SEVERITY_WEIGHTS.droppedPhase,
      ),
      phaseOutOfRange: this.weightFromConfig(
        'SEVERITY_WEIGHT_PHASE_OUT_OF_RANGE',
        DEFAULT_SEVERITY_WEIGHTS.phaseOutOfRange,
      ),
    };
  }

  private weightFromConfig(key: string, fallback: number): number {
    const raw = this.configService.get(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const configured = Number(raw);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}