/** Inactive-device DTO → domain model. The only place that knows the field names of GET /device/inactive. */
import type { InactiveDevice } from '../model/inactiveDevices.types'
import type { NetworkPlace } from '../model/liveMonitoring.types'
import type {
  InactiveDeviceDto,
  InactiveDevicesResponseDto,
  LocationRefDto,
} from './inactiveDevices.dto'

const toDate = (iso: string | null): Date | null => (iso === null ? null : new Date(iso))

/** Same id as text as nodes.mapper.ts, so the map filter applies unchanged (F-41). */
const toPlace = (ref: LocationRefDto): NetworkPlace => ({ id: String(ref.id), name: ref.name })

/** `inactiveNow` and `lastRecordAt` come from the backend as they are, never re-derived here. */
export function toInactiveDevice(dto: InactiveDeviceDto): InactiveDevice {
  return {
    id: dto.hw_id,
    kind: dto.kind,
    nodeId: dto.node,
    location: {
      zone: toPlace(dto.zone),
      substation: toPlace(dto.substation),
      circuit: toPlace(dto.circuit),
    },
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
