/** Inactive-device DTO → domain model. The only place that knows the field names of GET /device/inactive. */
import type { InactiveDevice } from '../model/inactiveDevices.types'
import type { InactiveDeviceDto, InactiveDevicesResponseDto } from './inactiveDevices.dto'

const toDate = (iso: string | null): Date | null => (iso === null ? null : new Date(iso))

/** `inactiveNow` and `lastRecordAt` come from the backend as they are, never re-derived here. */
export function toInactiveDevice(dto: InactiveDeviceDto): InactiveDevice {
  return {
    id: dto.hw_id,
    kind: dto.kind,
    nodeId: dto.node,
    zone: dto.zone.name,
    substation: dto.substation.name,
    circuit: dto.circuit.name,
    thresholdHours: dto.threshold_hours,
    inactiveNow: dto.inactive_now,
    lastRecordAt: toDate(dto.last_record_at),
    periods: dto.periods.map((period) => ({
      start: new Date(period.start),
      end: toDate(period.end),
    })),
  }
}

export function toInactiveDevices(response: InactiveDevicesResponseDto): InactiveDevice[] {
  return response.devices.map(toInactiveDevice)
}
