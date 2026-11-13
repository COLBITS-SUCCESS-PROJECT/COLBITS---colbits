/** Rules of the Inactive devices tab: time window, location filters and the F-40 order. */
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

/** `isInactiveNow` is the backend's `inactive_now`: a device that never reported has no period but is inactive. */
function toView(device: InactiveDevice, windowStart: number, now: number): InactiveDeviceView {
  const periods = clipPeriods(device, windowStart, now)
  const { inactiveNow, lastRecordAt } = device
  return {
    device,
    isInactiveNow: inactiveNow,
    silentMinutes:
      inactiveNow && lastRecordAt
        ? Math.floor((now - lastRecordAt.getTime()) / MS_PER_MINUTE)
        : null,
    totalMinutes: periods.reduce((sum, period) => sum + period.minutes, 0),
    periods,
  }
}

const timeOf = (date: Date | null) => (date === null ? Number.NEGATIVE_INFINITY : date.getTime())

const lastEnd = (device: InactiveDevice) =>
  Math.max(0, ...device.periods.map((period) => period.end?.getTime() ?? 0))

/**
 * Same order as the backend (F-40, backend/src/device/inactivity-periods.ts): devices silent now
 * first, from the oldest last record to the most recent, and one that never reported first of all;
 * then the devices that reported again, the most recently resolved first. Ties by hardware id.
 */
function compareViews(a: InactiveDeviceView, b: InactiveDeviceView): number {
  if (a.isInactiveNow !== b.isInactiveNow) return a.isInactiveNow ? -1 : 1
  const byTime = a.isInactiveNow
    ? timeOf(a.device.lastRecordAt) - timeOf(b.device.lastRecordAt)
    : lastEnd(b.device) - lastEnd(a.device)
  return byTime || a.device.id.localeCompare(b.device.id)
}

/** Devices inactive inside the window and the chosen location, ordered so maintenance starts with the oldest. */
export function selectInactiveDevices(
  devices: InactiveDevice[],
  filters: InactiveFilters,
  now: number
): InactiveDeviceView[] {
  const windowStart = now - TIME_WINDOWS[filters.timeWindow] * MS_PER_MINUTE
  return (
    devices
      .filter(
        (device) =>
          matches(filters.zone, device.zone) &&
          matches(filters.substation, device.substation) &&
          matches(filters.circuit, device.circuit) &&
          matches(filters.node, device.nodeId)
      )
      .map((device) => toView(device, windowStart, now))
      // A device silent now always stays, even without a period (it never reported).
      .filter((view) => view.isInactiveNow || view.totalMinutes > 0)
      .sort(compareViews)
  )
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
