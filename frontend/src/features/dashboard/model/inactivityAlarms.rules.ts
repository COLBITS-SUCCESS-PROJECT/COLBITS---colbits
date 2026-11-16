/**
 * Inactivity alarms of the fault panel (US17 · F-38, F-39). The backend does not list them in
 * GET /faults: each inactivity period of GET /device/inactive is one alarm. It opens at the period
 * start (last record + threshold, F-38) and resolves by itself at the next stored record, the
 * period end (F-39). Every time comes from the server, never from the browser clock (F-46).
 */
import { MS_PER_MINUTE } from './liveMonitoring.constants'
import type { InactiveDevice, InactiveDevicesSnapshot } from './inactiveDevices.types'
import type { FaultAlert } from './liveMonitoring.types'

function toAlarm(
  device: InactiveDevice,
  start: Date,
  end: Date | null,
  serverNow: number
): FaultAlert {
  return {
    id: `DEVICE_INACTIVITY:${device.id}:${start.toISOString()}`,
    device: device.kind,
    type: 'DEVICE_INACTIVITY',
    severity: 'INACTIVE',
    status: end === null ? 'OPEN' : 'RESOLVED',
    nodeId: device.nodeId,
    zone: device.location.zone.name,
    substation: device.location.substation.name,
    circuit: device.location.circuit.name,
    branch: null,
    channel: null,
    phases: null,
    classification: null,
    startedAt: start,
    endedAt: end,
    // Open: up to the server time of the answer. Resolved: up to the record that ended it (F-63).
    durationMinutes: Math.floor(((end?.getTime() ?? serverNow) - start.getTime()) / MS_PER_MINUTE),
    customersAffected: null,
    transformerLoad: null,
  }
}

/**
 * One alarm per period: open while the period has no end, resolved when it has one and that end
 * falls inside the window of the answer. A device that never reported has no period, so it has no
 * alarm here; it is listed only in the Inactive devices tab (PO, 2026-11-15).
 */
export function toInactivityAlarms(snapshot: InactiveDevicesSnapshot): FaultAlert[] {
  const from = snapshot.from.getTime()
  const to = snapshot.to.getTime()
  return snapshot.devices.flatMap((device) =>
    device.periods
      .filter((period) => period.end === null || period.end.getTime() >= from)
      .map((period) => toAlarm(device, period.start, period.end, to))
  )
}
