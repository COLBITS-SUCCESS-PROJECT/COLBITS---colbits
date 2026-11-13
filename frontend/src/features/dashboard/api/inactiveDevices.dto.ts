/** Wire shape of GET /device/inactive. Same fields as backend/src/device/dto/inactive-devices.dto.ts. */

export interface InactivityPeriodDto {
  /** ISO date: previous record + threshold, the moment the device is declared inactive (F-38). */
  start: string
  /** ISO date of the next stored record (F-39); null while the device is still silent. */
  end: string | null
}

export interface LocationRefDto {
  id: number
  name: string
}

export interface SubstationRefDto extends LocationRefDto {
  code: string
}

export interface InactiveDeviceDto {
  hw_id: string
  source_id: string
  kind: 'FALCON' | 'SMAC'
  node: string
  zone: LocationRefDto
  substation: SubstationRefDto
  circuit: LocationRefDto
  threshold_hours: number
  /** ISO date of the latest stored record; null when the device never reported. */
  last_record_at: string | null
  inactive_now: boolean
  energy_percent: number | null
  low_energy: boolean | null
  periods: InactivityPeriodDto[]
}

export interface InactiveDevicesThresholdsDto {
  falcon_inactivity_hours: number
  smac_inactivity_hours: number
  falcon_low_energy_percent: number
  smac_low_energy_percent: number
}

export interface InactiveDevicesResponseDto {
  from: string
  to: string
  thresholds: InactiveDevicesThresholdsDto
  count: number
  /** Already in the F-40 order. */
  devices: InactiveDeviceDto[]
}
