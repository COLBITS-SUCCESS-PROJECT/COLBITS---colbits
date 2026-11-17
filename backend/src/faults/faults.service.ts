import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ResolvedDeviceAlertThresholds,
  resolveDeviceAlertThresholds,
} from './device-alert-thresholds';
import { DEFAULT_SEVERITY_WEIGHTS, SeverityWeights } from './fault-ordering';
import { LOW_ENERGY_SETTINGS, lowEnergyThreshold } from '../device/low-energy';
import { DEFAULT_FALCON_INACTIVITY_HOURS } from '../nodes/fuse-state';
import { DEFAULT_SMAC_INACTIVITY_HOURS } from '../nodes/smac-state';
import { resolveSmacPhaseWindowDays } from '../nodes/transformer-state';

export const DEFAULT_FAULT_GROUPING_WINDOW_MINUTES = 5;

/** A setting that differs per device type: the Falcon (fuse) value and the SMAC (transformer) one. */
export interface PerDeviceSetting {
  falcon: number;
  smac: number;
}

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

  /**
   * SCRUM-245 · NF-22: thresholds of the overload and imbalance alert, configurable without code
   * changes (device-alert-thresholds.ts). Read on every call, like the other settings here.
   */
  getDeviceAlertThresholds(): ResolvedDeviceAlertThresholds {
    return resolveDeviceAlertThresholds((setting) =>
      this.configService.get(setting),
    );
  }

  /**
   * NF-08: low-energy thresholds in percent, FALCON_LOW_ENERGY_PERCENT and SMAC_LOW_ENERGY_PERCENT,
   * parsed like GET /device/low-energy does (a number in (0, 100], otherwise the default 30). Read
   * on every call, like the other settings here.
   */
  getLowEnergyThresholds(): PerDeviceSetting {
    return {
      falcon: lowEnergyThreshold(
        this.configService.get(LOW_ENERGY_SETTINGS.FALCON),
      ),
      smac: lowEnergyThreshold(this.configService.get(LOW_ENERGY_SETTINGS.SMAC)),
    };
  }

  /**
   * NF-07: inactivity thresholds in hours, FALCON_INACTIVITY_HOURS (9 by default) and
   * SMAC_INACTIVITY_HOURS (3), parsed exactly as GET /device/inactive does: a positive finite
   * number, otherwise the default.
   */
  getInactivityHours(): PerDeviceSetting {
    return {
      falcon: this.positiveFromConfig(
        'FALCON_INACTIVITY_HOURS',
        DEFAULT_FALCON_INACTIVITY_HOURS,
      ),
      smac: this.positiveFromConfig(
        'SMAC_INACTIVITY_HOURS',
        DEFAULT_SMAC_INACTIVITY_HOURS,
      ),
    };
  }

  /** SMAC_PHASE_WINDOW_DAYS (TD-04): days of readings that decide which channels a transformer has. */
  getSmacPhaseWindowDays(): number {
    return resolveSmacPhaseWindowDays(
      this.configService.get('SMAC_PHASE_WINDOW_DAYS'),
    );
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

  private positiveFromConfig(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
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