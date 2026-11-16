/**
 * Pure business rules of the fault panel: filtering (Figma: Fault Panel). Open faults keep the order
 * and the counters the backend decides (F-57, F-58, NF-11): the frontend neither sorts nor counts them.
 */
import { MS_PER_MINUTE, TIME_WINDOWS, type TimeWindow } from './liveMonitoring.constants'
import type { FaultAlert, MapLayer } from './liveMonitoring.types'

/**
 * Filters of the live view. Layers, location and search belong to the toolbar at the top of the map;
 * the time window is the panel's "last hour / last day" selector. The panel has no other filter of its
 * own: it follows the map (F-56, client review).
 */
export interface FaultFilters {
  layers: MapLayer[]
  zone: string
  substation: string
  circuit: string
  search: string
  timeWindow: TimeWindow
}

const LAYER_DEVICE = { FUSES: 'FALCON', TRANSFORMERS: 'SMAC' } as const

/** When a resolved fault ended (its start if the service did not say). */
function resolvedAtOf(fault: FaultAlert): number {
  return (fault.endedAt ?? fault.startedAt).getTime()
}

/**
 * "Last hour / last day" only limits resolved faults, by the time they were resolved, as
 * GET /faults/resolved counts them. An active fault stays listed however old it is (F-62).
 */
function isInsideTimeWindow(fault: FaultAlert, timeWindow: TimeWindow, now: number): boolean {
  if (fault.status === 'OPEN') return true
  return resolvedAtOf(fault) >= now - TIME_WINDOWS[timeWindow] * MS_PER_MINUTE
}

/**
 * `nodesInLocation`: the nodes of the map's location filter (US14). The zone / substation / circuit
 * filters hold ids and GET /faults sends only the circuit name, so a fault follows the map filter
 * through its node. Undefined = no location filter.
 */
export function matchesFilters(
  fault: FaultAlert,
  filters: FaultFilters,
  now: number,
  nodesInLocation?: ReadonlySet<string>
): boolean {
  const query = filters.search.trim().toLowerCase()
  return (
    filters.layers.some((layer) => LAYER_DEVICE[layer] === fault.device) &&
    (nodesInLocation === undefined || nodesInLocation.has(fault.nodeId)) &&
    (query === '' || fault.nodeId.toLowerCase().includes(query)) &&
    isInsideTimeWindow(fault, filters.timeWindow, now)
  )
}

/**
 * Resolved faults: the most recent resolution first (F-62), as GET /faults/resolved lists them. The
 * panel sorts them again only because it merges them with the inactivity alarms (US17), which come
 * from another service. TEMPORARY: once GET /faults/resolved lists DEVICE_INACTIVITY, its order can
 * be kept as it comes, like the open list.
 */
export function compareResolvedFaults(a: FaultAlert, b: FaultAlert): number {
  return resolvedAtOf(b) - resolvedAtOf(a)
}

/** Faults of one status that match the filters. Open ones keep the backend order (F-57); resolved ones are newest first (F-62). */
export function selectFaults(
  faults: FaultAlert[],
  filters: FaultFilters,
  status: FaultAlert['status'],
  now: number,
  nodesInLocation?: ReadonlySet<string>
): FaultAlert[] {
  const selected = faults.filter(
    (fault) => fault.status === status && matchesFilters(fault, filters, now, nodesInLocation)
  )
  return status === 'RESOLVED' ? selected.sort(compareResolvedFaults) : selected
}
