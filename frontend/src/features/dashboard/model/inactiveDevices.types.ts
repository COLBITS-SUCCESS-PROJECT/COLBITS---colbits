/** Domain types of the Inactive devices tab (Figma: Inactive Device Card — F-40, F-62, F-74). */
import type { DeviceKind } from './liveMonitoring.types'

/** A stretch of time without data. `end` is null while the device is still silent. */
export interface InactivePeriod {
  start: Date
  end: Date | null
}

/** A device that stopped reporting at least once, with its full inactivity history. */
export interface InactiveDevice {
  /** Hardware code shown next to the node, e.g. FAL-03090-C. */
  id: string
  kind: DeviceKind
  /** 10-character node ID, e.g. ND03090C04. */
  nodeId: string
  zone: string
  substation: string
  circuit: string
  /** Hours without data after which the device counts as inactive (9 Falcon, 3 SMAC). */
  thresholdHours: number
  periods: InactivePeriod[]
}

/** One inactivity period cut to the selected time window. */
export interface InactivePeriodInRange {
  start: Date
  /** null = still ongoing. */
  end: Date | null
  minutes: number
}

/** What the card shows: a device with its inactivity inside the selected time window. */
export interface InactiveDeviceView {
  device: InactiveDevice
  /** True while the device is still silent (an open period). */
  isInactiveNow: boolean
  /** Minutes since the open period started (whole silence, not only the window); null if reporting. */
  silentMinutes: number | null
  totalMinutes: number
  periods: InactivePeriodInRange[]
}
