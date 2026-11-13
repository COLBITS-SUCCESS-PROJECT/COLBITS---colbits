/** Fault DTO → domain model. The only place that knows the backend field names of GET /faults. */
import type { FaultAlert, FaultSeverity, PhaseStates } from '../model/liveMonitoring.types'
import type { ActiveFaultDto, ActiveFaultsResponseDto } from './faults.dto'

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
 * one entry per channel and the frontend does not add them up.
 */
function severityOf(dto: ActiveFaultDto): FaultSeverity {
  return dto.alert_type === 'FUSE_OPENING' ? 'CRITICAL' : 'WARNING'
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
    phases: toPhaseStates(dto.phases),
    classification: dto.classification,
    startedAt: new Date(dto.started_at),
    durationMinutes: Math.floor(dto.duration_seconds / SECONDS_PER_MINUTE),
    customersAffected: dto.client_count,
    transformerLoad: null,
  }
}

export function toFaultAlerts(response: ActiveFaultsResponseDto): FaultAlert[] {
  return response.faults.map(toFaultAlert)
}
