/** Wire format of GET /faults/indicators (backend/src/faults/dto/fault-indicators.dto.ts · SCRUM-285, SCRUM-286). */

export type FaultClassificationDto = 'MONOPHASIC' | 'BIPHASIC' | 'TRIPHASIC'

export interface CircuitContextDto {
  circuit_id: number
  circuit_name: string
  substation_id: number
  substation_name: string
}

export interface SubstationFaultCountDto {
  substation_id: number
  substation_code: string
  substation_name: string
  fault_count: number
}

export interface CircuitFaultCountDto extends CircuitContextDto {
  fault_count: number
}

export interface NodeFaultRankingDto extends CircuitContextDto {
  node: string
  fault_count: number
}

export interface LongestFaultDto extends CircuitContextDto {
  /** `<fuses_set_id>:<started_at>`. */
  id: string
  node: string
  fuses_set_id: number
  branch: string | null
  classification: FaultClassificationDto | null
  phases: string[] | null
  state: 'OPEN' | 'RESOLVED'
  started_at: string
  ended_at: string | null
  duration_seconds: number
}

export interface FaultIndicatorsResponseDto {
  generated_at: string
  /** Inclusive start and end of the queried period. */
  period: { from: string; to: string }
  minimum_duration_filter: { active: boolean; threshold_minutes: number; threshold_seconds: number }
  total_faults: number
  /** Both null when no fault is included. */
  duration: { average_seconds: number | null; max_seconds: number | null }
  /** Highest count first; only substations and circuits with at least one fault. */
  by_substation: SubstationFaultCountDto[]
  by_circuit: CircuitFaultCountDto[]
  /** Most faults first. */
  node_ranking: NodeFaultRankingDto[]
  /** Every included fault, longest first. */
  longest_faults: LongestFaultDto[]
}
