/** Raw shape of GET /nodes/:name/detail exactly as backend/src/nodes/dto/node-detail.dto.ts sends it. */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-109.md §6)

export interface FuseDetailDto {
  id: string
  phase: string
  hw_id: string | null
  /** As stored by the Falcon: 'Abierto' / 'Cerrado'. */
  fuse_state: string | null
  is_voltage_present: boolean | null
  inactive: boolean
  supercaps_per: number | null
  solar_panel: number | null
  /** ISO date-time. */
  recorded_at: string | null
}

export interface FuseSetDetailDto {
  id: number
  set_id: string | null
  client_count: number | null
  fuses: FuseDetailDto[]
}

export interface TransformerDetailDto {
  id: string
  hw_id: string | null
  inactive: boolean
  battery_per: number | null
  voltages: { va: number | null; vb: number | null; vc: number | null }
  recorded_at: string | null
}

export interface NodeDetailResponseDto {
  node: string
  circuit: { id: number; name: string }
  substation: { id: number; code: string; name: string }
  fuse_sets: FuseSetDetailDto[]
  transformers: TransformerDetailDto[]
}
