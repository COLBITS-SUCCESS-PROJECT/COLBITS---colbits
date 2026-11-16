/** Domain types of the demo scenario panel (US31 · F-100; docs/specs/dashboard/SCRUM-218.md). */

/** What an action acts on: a fuse (through its Falcon) or a transformer (through its SMAC). */
export type ScenarioTarget = 'FUSE' | 'TRANSFORMER'

/** SMAC channel of a transformer phase. */
export type ScenarioChannel = 'A' | 'B' | 'C'

export interface ScenarioAction {
  /** Backend code, e.g. OPEN_FUSE. */
  code: string
  target: ScenarioTarget
  /** The action needs a transformer phase. */
  needsChannel: boolean
  /** Backend description of the effect, shown only while the action has no label. */
  effect: string
}

export interface ScenarioCatalog {
  /** Demo mode: false everywhere but the demo environment (NF-03). */
  enabled: boolean
  actions: ScenarioAction[]
}

export interface ScenarioRun {
  action: string
  /** Fuse or transformer id, as the node detail lists it. */
  target: string
  channel: ScenarioChannel | null
}

export interface ScenarioResult {
  action: string
  target: string
  channel: ScenarioChannel | null
  /** Time of the stored event. */
  recordedAt: Date
}

/** Why the backend refused an action, for the message the panel shows. */
export type ScenarioFailure = 'ALREADY' | 'NOT_ALLOWED' | 'NOT_FOUND' | 'INVALID' | 'FAILED'
