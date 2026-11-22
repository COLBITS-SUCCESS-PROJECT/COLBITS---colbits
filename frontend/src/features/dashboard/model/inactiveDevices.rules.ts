/** Rules of the Inactive devices tab: periods cut to the server window and the map's location filter (F-41). */
import { LAYER_DEVICE } from './faultRules'
import { MS_PER_MINUTE } from './liveMonitoring.constants'
import type { MapLayer } from './liveMonitoring.types'
import { isLocationInFilter } from './mapFilters'
import type { LocationFilter } from './scopeOptions'
import type {
  InactiveDevice,
  InactiveDevicesSnapshot,
  InactiveDeviceView,
  InactivePeriodInRange,
} from './inactiveDevices.types'

/** Cuts each period to the server window [from, to]; periods outside it disappear. */
function clipPeriods(device: InactiveDevice, from: number, to: number): InactivePeriodInRange[] {
  return device.periods.flatMap((period) => {
    const start = Math.max(period.start.getTime(), from)
    const end = Math.min(period.end?.getTime() ?? to, to)
    const minutes = Math.round((end - start) / MS_PER_MINUTE)
    if (minutes < 1) return []
    return [{ start: new Date(start), end: period.end, minutes }]
  })
}

/**
 * `isInactiveNow` is the backend's `inactive_now`: a device that never reported has no period but is
 * inactive. The silence is measured up to the server's `to`, never the browser clock (F-46).
 */
function toView(device: InactiveDevice, from: number, to: number): InactiveDeviceView {
  const periods = clipPeriods(device, from, to)
  const { inactiveNow, lastRecordAt } = device
  return {
    device,
    isInactiveNow: inactiveNow,
    silentMinutes:
      inactiveNow && lastRecordAt
        ? Math.floor((to - lastRecordAt.getTime()) / MS_PER_MINUTE)
        : null,
    totalMinutes: periods.reduce((sum, period) => sum + period.minutes, 0),
    periods,
  }
}

/** Every map layer on: no device type is hidden. */
const ALL_LAYERS: readonly MapLayer[] = ['FUSES', 'TRANSFORMERS']

/**
 * Devices of the window asked for, restricted to what the map shows (F-41: the list has no filter of
 * its own): the zone / substation / circuit selected, the layers that are on (Falcon on the fuses
 * layer, SMAC on the transformers layer) and the search, by node or device id, like the other tabs.
 * The backend order (F-40) is kept as sent: filtering never changes it and the frontend does not sort.
 */
export function selectInactiveDevices(
  snapshot: InactiveDevicesSnapshot,
  location: LocationFilter,
  layers: readonly MapLayer[] = ALL_LAYERS,
  search = ''
): InactiveDeviceView[] {
  const from = snapshot.from.getTime()
  const to = snapshot.to.getTime()
  const query = search.trim().toLowerCase()
  return (
    snapshot.devices
      .filter((device) => isLocationInFilter(device.location, location))
      .filter((device) => layers.some((layer) => LAYER_DEVICE[layer] === device.kind))
      .filter(
        (device) =>
          query === '' ||
          device.nodeId.toLowerCase().includes(query) ||
          device.id.toLowerCase().includes(query)
      )
      .map((device) => toView(device, from, to))
      // A device silent now always stays, even without a period (it never reported).
      .filter((view) => view.isInactiveNow || view.totalMinutes > 0)
  )
}
