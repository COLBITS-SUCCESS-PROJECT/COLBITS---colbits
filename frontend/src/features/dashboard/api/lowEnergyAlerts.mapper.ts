/**
 * Low-energy DTO → alarm of the fault panel (US18 · F-44, F-45). The only place that knows the field
 * names of GET /device/low-energy.
 *
 * TEMPORARY: GET /faults does not list LOW_ENERGY yet, so the frontend builds the alarm the backend
 * should send (id, status, duration). Delete this file when GET /faults lists LOW_ENERGY; then
 * faults.mapper.ts maps it like any other alert type.
 */
import { MS_PER_MINUTE } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'
import type {
  LowEnergyAlertDto,
  LowEnergyAlertsResponseDto,
  ResolvedLowEnergyAlertDto,
  ResolvedLowEnergyAlertsResponseDto,
} from './lowEnergyAlerts.dto'

/**
 * Same form as the backend device-alert ids (`<type>:<source>:<started_at>`, device-alerts.ts), so the
 * id stays stable for the whole low streak and should match the one GET /faults will send.
 */
export function lowEnergyAlarmId(dto: LowEnergyAlertDto): string {
  return `LOW_ENERGY:${dto.source_id}:${new Date(dto.since).toISOString()}`
}

/**
 * One open alarm per device. The endpoint sends no server time, so the duration runs from `since`
 * to the latest reading (`recorded_at`): server times only, never the browser clock (F-46).
 * Amber like the other non-fuse alarms. The endpoint has no history, so there are no resolved ones.
 */
export function toLowEnergyAlarm(dto: LowEnergyAlertDto): FaultAlert {
  const startedAt = new Date(dto.since)
  const recordedAt = new Date(dto.recorded_at)
  return {
    id: lowEnergyAlarmId(dto),
    device: dto.kind,
    type: 'LOW_ENERGY',
    severity: 'WARNING',
    status: 'OPEN',
    nodeId: dto.node,
    zone: dto.zone.name,
    substation: dto.substation.name,
    circuit: dto.circuit.name,
    branch: null,
    sourceId: dto.source_id,
    channel: null,
    channels: null,
    phases: null,
    classification: null,
    startedAt,
    endedAt: null,
    durationMinutes: Math.max(
      0,
      Math.floor((recordedAt.getTime() - startedAt.getTime()) / MS_PER_MINUTE)
    ),
    customersAffected: null,
    transformerLoad: null,
    conditions: null,
    energy: { levelPct: dto.energy_percent, thresholdPct: dto.threshold_percent },
  }
}

/** Alarms in the order the backend sent them (lowest level first). */
export function toLowEnergyAlarms(response: LowEnergyAlertsResponseDto): FaultAlert[] {
  return response.alerts.map(toLowEnergyAlarm)
}

/**
 * A low-energy episode that ended: resolved when the device reported a level at or above the threshold
 * again. The id is the one the alarm had while it was open, so the Active and Resolved tabs never
 * show the same episode twice. The duration runs from `since` to the reading that ended it (F-63);
 * the level shown is the lowest one of the episode.
 */
export function toResolvedLowEnergyAlarm(dto: ResolvedLowEnergyAlertDto): FaultAlert {
  const startedAt = new Date(dto.since)
  const endedAt = new Date(dto.ended_at)
  return {
    id: `LOW_ENERGY:${dto.source_id}:${startedAt.toISOString()}`,
    device: dto.kind,
    type: 'LOW_ENERGY',
    severity: 'WARNING',
    status: 'RESOLVED',
    nodeId: dto.node,
    zone: dto.zone.name,
    substation: dto.substation.name,
    circuit: dto.circuit.name,
    branch: null,
    sourceId: dto.source_id,
    channel: null,
    channels: null,
    phases: null,
    classification: null,
    startedAt,
    endedAt,
    durationMinutes: Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / MS_PER_MINUTE)
    ),
    customersAffected: null,
    transformerLoad: null,
    conditions: null,
    energy: { levelPct: dto.lowest_energy_percent, thresholdPct: dto.threshold_percent },
  }
}

export function toResolvedLowEnergyAlarms(
  response: ResolvedLowEnergyAlertsResponseDto
): FaultAlert[] {
  return response.alerts.map(toResolvedLowEnergyAlarm)
}
