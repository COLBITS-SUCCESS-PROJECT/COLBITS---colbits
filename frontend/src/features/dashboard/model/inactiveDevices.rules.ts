/** Rules of the Inactive devices tab: time window, the map's location filter (F-41) and the F-40 order. */
import { MS_PER_MINUTE, TIME_WINDOWS, type TimeWindow } from './liveMonitoring.constants'
import { isLocationInFilter } from './mapFilters'
import type { LocationFilter } from './scopeOptions'
import type {
  InactiveDevice,
  InactiveDeviceView,
  InactivePeriodInRange,
} from './inactiveDevices.types'

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

/**
 * Devices inactive inside the window, restricted to the zone / substation / circuit selected on the
 * map (F-41: the list has no location filter of its own), ordered so maintenance starts with the oldest.
 */
export function selectInactiveDevices(
  devices: InactiveDevice[],
  timeWindow: TimeWindow,
  location: LocationFilter,
  now: number
): InactiveDeviceView[] {
  const windowStart = now - TIME_WINDOWS[timeWindow] * MS_PER_MINUTE
  return (
    devices
      .filter((device) => isLocationInFilter(device.location, location))
      .map((device) => toView(device, windowStart, now))
      // A device silent now always stays, even without a period (it never reported).
      .filter((view) => view.isInactiveNow || view.totalMinutes > 0)
      .sort(compareViews)
  )
}
