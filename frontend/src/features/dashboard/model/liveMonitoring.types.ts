/** Domain types of the Live Monitoring feature (fuses = Falcon devices, transformers = SMAC devices). */

export type DeviceKind = 'FALCON' | 'SMAC'

/** Map layer: Falcon fuses or SMAC transformers. */
export type MapLayer = 'FUSES' | 'TRANSFORMERS'

/** State precedence shared by markers, legend and fault cards (Figma: Status – Fuses & Transformers). */
/** UNKNOWN = the backend does not report this device's state yet (shown in gray, "no data"). */
export type NetworkState = 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL' | 'UNKNOWN'

/** WGS84 position as recorded for a node (decimal degrees). */
export interface GeoCoordinates {
  latitude: number
  longitude: number
}

/** A network node (pole) within the user's scope, with its recorded coordinates (F-12). */
export interface NetworkNode {
  /** 10-character node ID, e.g. ND04821A07. */
  id: string
  coordinates: GeoCoordinates
  /** null when the node has no fuse set. */
  fuseState: NetworkState | null
  /** null when the node has no transformer. */
  transformerState: NetworkState | null
}

export type PhaseState = 'CRITICAL' | 'WARNING' | 'OK'

/** Canonical phases R · S · T. */
export interface PhaseStates {
  R: PhaseState
  S: PhaseState
  T: PhaseState
}

export type PhaseClassification = 'MONOPHASIC' | 'BIPHASIC' | 'TRIPHASIC'

export type AlertType = 'FUSE_OPENING' | 'NO_VOLTAGE' | 'PHASE_LOSS' | 'OVERLOAD_UNBALANCE'

export type FaultSeverity = 'CRITICAL' | 'WARNING' | 'INACTIVE'

export type FaultStatus = 'OPEN' | 'RESOLVED'

export interface TransformerLoad {
  loadPct: number
  voltageUnbalancePct: number
}

/** One alarm of the fault panel (Figma: Fault List Item — F-51, F-55). */
export interface FaultAlert {
  id: string
  device: DeviceKind
  type: AlertType
  severity: FaultSeverity
  status: FaultStatus
  /** 10-character node ID, e.g. ND04821A07. */
  nodeId: string
  zone: string
  substation: string
  circuit: string
  branch: string | null
  phases: PhaseStates | null
  startedAt: Date
  durationMinutes: number
  customersAffected: number
  transformerLoad: TransformerLoad | null
}

export interface FaultCounters {
  fuseAlarmNodes: number
  voltageAlarmNodes: number
  phaseOutOfRangeNodes: number
  phaseDroppedNodes: number
}

/** Fault panel data. Map nodes come from the node service (`useNodesQuery`). */
export interface LiveMonitoringData {
  faults: FaultAlert[]
  counters: FaultCounters
}
