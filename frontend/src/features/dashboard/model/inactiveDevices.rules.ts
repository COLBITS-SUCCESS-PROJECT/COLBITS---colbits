/** Rules of the Inactive devices tab: time window, location filters and "longest silence first" order. */
import { ALL, MS_PER_MINUTE, TIME_WINDOWS, type TimeWindow } from './liveMonitoring.constants'
import type {
  InactiveDevice,
  InactiveDeviceView,
  InactivePeriodInRange,
} from './inactiveDevices.types'

export interface InactiveFilters {
  timeWindow: TimeWindow
  zone: string
  substation: string
  circuit: string
  node: string
}

export interface InactiveScope {
  zones: string[]
  substations: string[]
  circuits: string[]
  nodes: string[]
}

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))

const matches = (selected: string, value: string) => selected === ALL || selected === value

/** Cuts each period to [now − window, now]; periods outside the window disappear. */
function clipPeriods(
  device: InactiveDevice,
  windowStart: number,
  now: number
): InactivePeriodInRange[] {
  return device.periods.flatMap((period) => {
    const start = Math.max(period.start.getTime(), windowStart)
    const end = Math.min(period.end?.getTime() ?? now, now)
    const minutes = Math.round((end - start) / MS_PER_MINUTE)
    if (minutes < 1) return []
    return [{ start: new Date(start), end: period.end, minutes }]
  })
}

function toView(device: InactiveDevice, windowStart: number, now: number): InactiveDeviceView {
  const openPeriod = device.periods.find((period) => period.end === null)
  const periods = clipPeriods(device, windowStart, now)
  return {
    device,
    isInactiveNow: openPeriod !== undefined,
    silentMinutes: openPeriod
      ? Math.floor((now - openPeriod.start.getTime()) / MS_PER_MINUTE)
      : null,
    totalMinutes: periods.reduce((sum, period) => sum + period.minutes, 0),
    periods,
  }
}

/** Longest silence first: devices silent now by how long they have been silent, then the rest by total. */
function compareViews(a: InactiveDeviceView, b: InactiveDeviceView): number {
  if (a.isInactiveNow !== b.isInactiveNow) return a.isInactiveNow ? -1 : 1
  const byTime = a.isInactiveNow
    ? (b.silentMinutes ?? 0) - (a.silentMinutes ?? 0)
    : b.totalMinutes - a.totalMinutes
  return byTime || a.device.nodeId.localeCompare(b.device.nodeId)
}

/** Devices inactive inside the window and the chosen location, ordered so maintenance starts with the oldest. */
export function selectInactiveDevices(
  devices: InactiveDevice[],
  filters: InactiveFilters,
  now: number
): InactiveDeviceView[] {
  const windowStart = now - TIME_WINDOWS[filters.timeWindow] * MS_PER_MINUTE
  return devices
    .filter(
      (device) =>
        matches(filters.zone, device.zone) &&
        matches(filters.substation, device.substation) &&
        matches(filters.circuit, device.circuit) &&
        matches(filters.node, device.nodeId)
    )
    .map((device) => toView(device, windowStart, now))
    .filter((view) => view.totalMinutes > 0)
    .sort(compareViews)
}

/** Options of the location selects; each level only offers what fits the levels above it. */
export function deriveInactiveScope(
  devices: InactiveDevice[],
  filters: Pick<InactiveFilters, 'zone' | 'substation' | 'circuit'>
): InactiveScope {
  const inZone = devices.filter((device) => matches(filters.zone, device.zone))
  const inSubstation = inZone.filter((device) => matches(filters.substation, device.substation))
  const inCircuit = inSubstation.filter((device) => matches(filters.circuit, device.circuit))
  return {
    zones: uniqueSorted(devices.map((device) => device.zone)),
    substations: uniqueSorted(inZone.map((device) => device.substation)),
    circuits: uniqueSorted(inSubstation.map((device) => device.circuit)),
    nodes: uniqueSorted(inCircuit.map((device) => device.nodeId)),
  }
}
