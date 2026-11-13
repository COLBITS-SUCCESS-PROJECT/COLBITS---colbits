/** Pure business rules of the fault panel: filtering and sorting (Figma: Fault Panel). */
import { MS_PER_MINUTE, TIME_WINDOWS, type TimeWindow } from './liveMonitoring.constants'
import type { AlertType, FaultAlert, FaultCounters, MapLayer } from './liveMonitoring.types'

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

/** "Last hour / last day" only limits resolved faults: an active fault stays listed however old it is (F-62). */
function isInsideTimeWindow(fault: FaultAlert, timeWindow: TimeWindow, now: number): boolean {
  if (fault.status === 'OPEN') return true
  return fault.startedAt.getTime() >= now - TIME_WINDOWS[timeWindow] * MS_PER_MINUTE
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

/** "Sorted by customers affected, then oldest first". An unknown client count sorts as 0. */
export function compareFaults(a: FaultAlert, b: FaultAlert): number {
  return (
    (b.customersAffected ?? 0) - (a.customersAffected ?? 0) ||
    a.startedAt.getTime() - b.startedAt.getTime()
  )
}

export function selectFaults(
  faults: FaultAlert[],
  filters: FaultFilters,
  status: FaultAlert['status'],
  now: number,
  nodesInLocation?: ReadonlySet<string>
): FaultAlert[] {
  return faults
    .filter(
      (fault) => fault.status === status && matchesFilters(fault, filters, now, nodesInLocation)
    )
    .sort(compareFaults)
}

/**
 * Counter of the panel summary → the alert type whose nodes it counts. F-58 asks for exactly these
 * four counters; no other alert type (e.g. OVERLOAD_UNBALANCE) adds to any of them.
 *
 * BACKEND EXPECTED: the counters are derived from GET /faults (no counters endpoint yet, US15), so
 * each one only moves when the service lists its type, with `node` and `device`, and the mapper
 * (api/faults.mapper.ts) keeps it. FUSE_OPENING is mapped today; NO_VOLTAGE, PHASE_LOSS and
 * PHASE_OUT_OF_RANGE are already sent by the backend (SCRUM-225) but not read yet.
 */
const COUNTER_ALERT_TYPE: Record<keyof FaultCounters, AlertType> = {
  fuseAlarmNodes: 'FUSE_OPENING',
  voltageAlarmNodes: 'NO_VOLTAGE',
  phaseOutOfRangeNodes: 'PHASE_OUT_OF_RANGE',
  phaseDroppedNodes: 'PHASE_LOSS',
}

/**
 * Nodes in alarm per alert type, over the faults the panel lists, so the counters follow the map
 * filter. A node counts once per type however many faults it has (e.g. two fuse sets).
 */
export function countAlarmNodes(faults: FaultAlert[]): FaultCounters {
  const count = (type: AlertType) =>
    new Set(faults.filter((fault) => fault.type === type).map((fault) => fault.nodeId)).size

  return {
    fuseAlarmNodes: count(COUNTER_ALERT_TYPE.fuseAlarmNodes),
    voltageAlarmNodes: count(COUNTER_ALERT_TYPE.voltageAlarmNodes),
    phaseOutOfRangeNodes: count(COUNTER_ALERT_TYPE.phaseOutOfRangeNodes),
    phaseDroppedNodes: count(COUNTER_ALERT_TYPE.phaseDroppedNodes),
  }
}
