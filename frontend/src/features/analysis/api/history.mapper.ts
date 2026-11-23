/** Fault-history DTO → domain model. The only place that knows the backend field names. */
import type { HistorySummary, ScopeNode, TrendInterval } from '../model/history.types'
import type {
  FaultHistoryResponseDto,
  ScopeNodeDto,
  ScopeNodesResponseDto,
  TrendIntervalDto,
} from './history.dto'

const INTERVAL: Record<TrendIntervalDto, TrendInterval> = {
  day: 'DAY',
  week: 'WEEK',
}

export function toHistorySummary(dto: FaultHistoryResponseDto): HistorySummary {
  return {
    interval: INTERVAL[dto.interval],
    trend: dto.series.map((point) => ({
      start: point.start.slice(0, 10),
      fuseOpenings: point.fuse_faults,
      voltageAbsences: point.voltage_alarms,
    })),
    totals: {
      fuseOpenings: dto.totals.fuse_faults,
      voltageAbsences: dto.totals.voltage_alarms,
    },
    phaseDistribution: dto.phase_distribution
      ? {
          MONOPHASIC: dto.phase_distribution.monophasic,
          BIPHASIC: dto.phase_distribution.biphasic,
          TRIPHASIC: dto.phase_distribution.triphasic,
        }
      : null,
  }
}

/** A node without its full zone › substation › circuit cannot be placed in the filter, so it is left out. */
function toScopeNode(dto: ScopeNodeDto): ScopeNode[] {
  if (!dto.zone || !dto.substation || !dto.circuit) return []
  return [
    {
      id: dto.name,
      zone: { id: String(dto.zone.id), name: dto.zone.name },
      substation: { id: String(dto.substation.id), name: dto.substation.name },
      circuit: { id: String(dto.circuit.id), name: dto.circuit.name },
    },
  ]
}

export function toScopeNodes(dto: ScopeNodesResponseDto): ScopeNode[] {
  return dto.nodes.flatMap(toScopeNode)
}
