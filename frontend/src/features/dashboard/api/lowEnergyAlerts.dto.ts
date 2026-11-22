/**
 * Wire shape of GET /device/low-energy (US18 · F-44, F-45). Same fields as
 * backend/src/device/dto/low-energy-alerts.dto.ts.
 *
 * TEMPORARY: GET /faults does not list LOW_ENERGY yet, so the panel reads this endpoint and merges
 * its alerts with the others. Delete this file when GET /faults (and GET /faults/resolved) list
 * LOW_ENERGY: the fault DTO will carry them.
 */
import type { LocationRefDto, SubstationRefDto } from './inactiveDevices.dto'

export interface LowEnergyAlertDto {
  alert_type: 'LOW_ENERGY'
  kind: 'FALCON' | 'SMAC'
  hw_id: string
  /** custom_id of the fuse (Falcon) or transformer (SMAC) the device monitors. */
  source_id: string
  node: string
  zone: LocationRefDto
  substation: SubstationRefDto
  circuit: LocationRefDto
  /** Latest stored level in %: supercaps_per (Falcon, F-44) or battery_per (SMAC, F-45). */
  energy_percent: number
  /** Threshold it is below (NF-08). */
  threshold_percent: number
  /** ISO date of that latest reading (F-46). */
  recorded_at: string
  /** ISO date of the first reading of the current low streak: active since then. */
  since: string
}

export interface LowEnergyAlertsResponseDto {
  falcon_low_energy_percent: number
  smac_low_energy_percent: number
  count: number
  /** Active alerts only (no resolved history), lowest level first. */
  alerts: LowEnergyAlertDto[]
}

/** One low-energy episode that ended (GET /device/low-energy/resolved). */
export interface ResolvedLowEnergyAlertDto {
  alert_type: 'LOW_ENERGY'
  kind: 'FALCON' | 'SMAC'
  hw_id: string
  source_id: string
  node: string
  zone: LocationRefDto
  substation: SubstationRefDto
  circuit: LocationRefDto
  /** Lowest level of the episode, %. */
  lowest_energy_percent: number
  threshold_percent: number
  /** ISO date of the first low reading: the same `since` the active alert had. */
  since: string
  /** ISO date of the first reading back at or above the threshold. */
  ended_at: string
}

export interface ResolvedLowEnergyAlertsResponseDto {
  falcon_low_energy_percent: number
  smac_low_energy_percent: number
  count: number
  /** Episodes that ended inside the window, newest end first. */
  alerts: ResolvedLowEnergyAlertDto[]
}
