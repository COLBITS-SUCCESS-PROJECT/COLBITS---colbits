/** Raw shapes of GET and POST /scenarios exactly as backend/src/scenarios/dto/scenarios.dto.ts sends them. */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-218.md §6)

export type ScenarioChannelDto = 'A' | 'B' | 'C'

export interface ScenarioActionDto {
  action: string
  /** 'FUSE' or 'TRANSFORMER'. */
  target: string
  channel_required: boolean
  effect: string
}

export interface ScenariosStatusDto {
  enabled: boolean
  actions: ScenarioActionDto[]
}

export interface RunScenarioRequestDto {
  action: string
  /** Fuse or transformer custom id. */
  target: string
  /** Only for the actions with `channel_required`. */
  channel?: ScenarioChannelDto
}

export interface ScenarioResultDto {
  action: string
  node: string
  target: string
  channel: ScenarioChannelDto | null
  hw_id: string
  /** Technical Annex §4.2 code, e.g. 131420; null for the actions that write a reading and no event. */
  event_code: string | null
  /** MSG for a free fall (13xx01); null when no event is written. */
  event_type: 'SET' | 'CLEAR' | 'MSG' | null
  /** ISO date-time. */
  recorded_at: string
  effect: string
}
