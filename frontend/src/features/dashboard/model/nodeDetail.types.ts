/** Domain types of the node detail panel (US11 · F-27, F-29; docs/specs/dashboard/SCRUM-109.md). */

/** Fuse state as the panel shows it. UNKNOWN = the Falcon never reported. */
export type FuseState = 'OPEN' | 'CLOSED' | 'UNKNOWN'

export interface FuseDetail {
  id: string
  /** Phase letter as stored (R, S, T, or legacy I, C, D). */
  phase: string
  /** Falcon installed on the fuse. */
  deviceId: string | null
  state: FuseState
  /** null = not reported. */
  hasVoltage: boolean | null
  isInactive: boolean
  /** Supercapacitor level, %. */
  supercapsPercent: number | null
  solarPanel: number | null
  lastRecordAt: Date | null
}

export interface FuseSetDetail {
  id: number
  /** Branch letter; null on a node with a single set. */
  branch: string | null
  /** F-29. null = not recorded (not the same as 0). */
  clientCount: number | null
  fuses: FuseDetail[]
}

export interface TransformerDetail {
  id: string
  /** SMAC monitoring it. */
  deviceId: string | null
  isInactive: boolean
  /** Battery level, %. */
  batteryPercent: number | null
  voltages: { a: number | null; b: number | null; c: number | null }
  lastRecordAt: Date | null
}

export interface NodeDetail {
  nodeId: string
  circuit: { id: number; name: string }
  substation: { id: number; code: string; name: string }
  fuseSets: FuseSetDetail[]
  /** Empty when the node has no transformer. */
  transformers: TransformerDetail[]
}
