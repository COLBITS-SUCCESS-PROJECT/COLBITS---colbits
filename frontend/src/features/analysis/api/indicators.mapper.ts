/** GET /faults/indicators → domain (F-68 to F-70). */
import type { FaultIndicators } from '../model/indicators.types'
import type {
  CircuitContextDto,
  FaultIndicatorsResponseDto,
  LongestFaultDto,
} from './indicators.dto'

/** Labels each circuit by its name, adding the substation when another circuit has the same name. */
function circuitLabeller(circuits: readonly CircuitContextDto[]) {
  const idsByName = new Map<string, Set<number>>()
  for (const { circuit_name: name, circuit_id: id } of circuits) {
    idsByName.set(name, (idsByName.get(name) ?? new Set()).add(id))
  }
  return ({ circuit_name: name, substation_name: substation }: CircuitContextDto) =>
    (idsByName.get(name)?.size ?? 0) > 1 ? `${name} · ${substation}` : name
}

/** Start of each node's most recent fault. `longest_faults` holds every included fault, so none is missed. */
function latestStartByNode(faults: readonly LongestFaultDto[]): Map<string, string> {
  const latest = new Map<string, string>()
  for (const { node, started_at: startedAt } of faults) {
    const current = latest.get(node)
    if (current === undefined || Date.parse(startedAt) > Date.parse(current)) {
      latest.set(node, startedAt)
    }
  }
  return latest
}

export function toFaultIndicators(dto: FaultIndicatorsResponseDto): FaultIndicators {
  const circuitOf = circuitLabeller([...dto.by_circuit, ...dto.node_ranking, ...dto.longest_faults])
  const lastFaultAt = latestStartByNode(dto.longest_faults)

  return {
    totalFaults: dto.total_faults,
    averageSeconds: dto.duration.average_seconds,
    maxSeconds: dto.duration.max_seconds,
    minimumDuration: {
      isActive: dto.minimum_duration_filter.active,
      thresholdSeconds: dto.minimum_duration_filter.threshold_seconds,
    },
    bySubstation: dto.by_substation.map((substation) => ({
      id: String(substation.substation_id),
      label: substation.substation_name,
      count: substation.fault_count,
    })),
    byCircuit: dto.by_circuit.map((circuit) => ({
      id: String(circuit.circuit_id),
      label: circuitOf(circuit),
      count: circuit.fault_count,
    })),
    nodeRanking: dto.node_ranking.map((row) => ({
      node: row.node,
      circuit: circuitOf(row),
      faults: row.fault_count,
      lastFaultAt: lastFaultAt.get(row.node) ?? null,
    })),
    longestFaults: dto.longest_faults.map((fault) => ({
      id: fault.id,
      node: fault.node,
      circuit: circuitOf(fault),
      durationSeconds: fault.duration_seconds,
      classification: fault.classification,
      isOpen: fault.state === 'OPEN',
    })),
  }
}
