/** Fault DTO → domain model. The only place that knows the backend field names of GET /faults. */
import type {
  FaultAlert,
  FaultCounters,
  FaultSeverity,
  LiveMonitoringData,
  PhaseStates,
  TransformerLoad,
} from '../model/liveMonitoring.types'
import type {
  ActiveFaultDto,
  ActiveFaultsResponseDto,
  FaultNodeCountersDto,
  TransformerLoadDto,
} from './faults.dto'

const SECONDS_PER_MINUTE = 60
const DRAWN_PHASES: (keyof PhaseStates)[] = ['R', 'S', 'T']

/**
 * Affected phases → R · S · T states (affected = CRITICAL). null when there are none, or when they
 * use the legacy I · C · D alphabet, which is never mapped to R · S · T (client decision, 2026-10-23).
 */
function toPhaseStates(phases: string[] | null): PhaseStates | null {
  if (!phases || phases.length === 0) return null
  if (!phases.every((phase) => DRAWN_PHASES.some((drawn) => drawn === phase))) return null
  return {
    R: phases.includes('R') ? 'CRITICAL' : 'OK',
    S: phases.includes('S') ? 'CRITICAL' : 'OK',
    T: phases.includes('T') ? 'CRITICAL' : 'OK',
  }
}

/**
 * Accent of the card (Figma "Fault List Item"): an open fuse is red, the same red as its node on the
 * map (F-15). The other alarms are amber: no voltage, phase out of range and one SMAC channel down.
 * "2+ SMAC phases down = red" is not applied: a SMAC channel is not a phase, so the backend sends
 * one entry per channel and the frontend does not add them up. An inactive device is gray, the
 * same as the inactivity alarms built from GET /device/inactive (inactivityAlarms.rules.ts).
 */
function severityOf(dto: ActiveFaultDto): FaultSeverity {
  if (dto.alert_type === 'FUSE_OPENING') return 'CRITICAL'
  return dto.alert_type === 'DEVICE_INACTIVITY' ? 'INACTIVE' : 'WARNING'
}

/** Last load and unbalance values of an OVERLOAD_UNBALANCE alert; null on every other alert. */
function toTransformerLoad(dto: TransformerLoadDto | null): TransformerLoad | null {
  if (!dto) return null
  return {
    loadPct: dto.load_percent,
    voltageUnbalancePct: dto.vuf_percent,
    currentUnbalancePct: dto.cuf_percent,
  }
}

export function toFaultAlert(dto: ActiveFaultDto): FaultAlert {
  return {
    id: dto.id,
    device: dto.device,
    type: dto.alert_type,
    severity: severityOf(dto),
    status: dto.state,
    nodeId: dto.node,
    zone: null,
    substation: null,
    circuit: dto.circuit.name,
    branch: dto.branch,
    sourceId: dto.source_id,
    channel: dto.channel,
    channels: dto.channels,
    phases: toPhaseStates(dto.phases),
    classification: dto.classification,
    startedAt: new Date(dto.started_at),
    endedAt: dto.ended_at === null ? null : new Date(dto.ended_at),
    durationMinutes: Math.floor(dto.duration_seconds / SECONDS_PER_MINUTE),
    customersAffected: dto.client_count,
    transformerLoad: toTransformerLoad(dto.transformer_load),
    conditions: dto.conditions,
    // GET /faults has no energy field yet: a LOW_ENERGY from it shows without its level until the
    // backend adds one (then map it here, like transformer_load).
    energy: null,
  }
}

/** Faults in the order the backend sent them (F-57): never sorted here or later. */
export function toFaultAlerts(response: ActiveFaultsResponseDto): FaultAlert[] {
  return response.faults.map(toFaultAlert)
}

/** Node counters the backend computed over the whole list (F-58). */
export function toFaultCounters(dto: FaultNodeCountersDto): FaultCounters {
  return {
    fuseAlarmNodes: dto.fuseAlarmNodes,
    voltageAlarmNodes: dto.voltageAlarmNodes,
    phaseOutOfRangeNodes: dto.phaseOutOfRangeNodes,
    phaseDroppedNodes: dto.phaseDroppedNodes,
  }
}

export function toLiveMonitoringData(response: ActiveFaultsResponseDto): LiveMonitoringData {
  return { faults: toFaultAlerts(response), counters: toFaultCounters(response.counters) }
}
