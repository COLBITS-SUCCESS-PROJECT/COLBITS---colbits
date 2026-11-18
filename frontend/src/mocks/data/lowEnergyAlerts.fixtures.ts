/**
 * Sample low-energy alerts in the shape of GET /device/low-energy (US18 · F-44, F-45), on the sample
 * nodes of the map. TEMPORARY, like the endpoint call: delete when GET /faults lists LOW_ENERGY.
 */
import type {
  LowEnergyAlertDto,
  LowEnergyAlertsResponseDto,
  ResolvedLowEnergyAlertDto,
  ResolvedLowEnergyAlertsResponseDto,
} from '@/features/dashboard/api/lowEnergyAlerts.dto'
import { locationOf } from './inactiveDevices.fixtures'

const MS_PER_MINUTE = 60_000
const THRESHOLD_PERCENT = 30

const minutesAgo = (now: number, minutes: number) =>
  new Date(now - minutes * MS_PER_MINUTE).toISOString()

type Sample = Pick<
  LowEnergyAlertDto,
  'kind' | 'hw_id' | 'source_id' | 'node' | 'energy_percent' | 'recorded_at' | 'since'
>

function alert(sample: Sample): LowEnergyAlertDto {
  return {
    alert_type: 'LOW_ENERGY',
    ...sample,
    ...locationOf(sample.node),
    threshold_percent: THRESHOLD_PERCENT,
  }
}

/**
 * Lowest level first, like the backend: the Falcon of ND08890C04 (12 %, the same level the inactive
 * devices sample reports) and the SMAC battery of ND09931A01 (22 %).
 */
export function lowEnergyAlertDtoFixtures(now: number): LowEnergyAlertDto[] {
  return [
    alert({
      kind: 'FALCON',
      hw_id: '1308890C04',
      source_id: 'ND08890C04-A-R',
      node: 'ND08890C04',
      energy_percent: 12,
      recorded_at: minutesAgo(now, 1290),
      since: minutesAgo(now, 1500),
    }),
    alert({
      kind: 'SMAC',
      hw_id: '0509931A01',
      source_id: 'ND09931A01-T1-3',
      node: 'ND09931A01',
      energy_percent: 22,
      recorded_at: minutesAgo(now, 5),
      since: minutesAgo(now, 95),
    }),
  ]
}

/** The answer of GET /device/low-energy at `now` for the devices of `nodes` (null = every node). */
export function lowEnergyAlertsResponseFixture(
  now: number,
  nodes: readonly string[] | null = null
): LowEnergyAlertsResponseDto {
  const alerts = lowEnergyAlertDtoFixtures(now).filter(
    (candidate) => nodes === null || nodes.includes(candidate.node)
  )
  return {
    falcon_low_energy_percent: THRESHOLD_PERCENT,
    smac_low_energy_percent: THRESHOLD_PERCENT,
    count: alerts.length,
    alerts,
  }
}

/**
 * The answer of GET /device/low-energy/resolved: no episode by default (the tests that list resolved
 * alarms count the cards), or the ones given, as the backend sends them (newest end first).
 */
export function resolvedLowEnergyAlertsResponseFixture(
  alerts: ResolvedLowEnergyAlertDto[] = []
): ResolvedLowEnergyAlertsResponseDto {
  return {
    falcon_low_energy_percent: THRESHOLD_PERCENT,
    smac_low_energy_percent: THRESHOLD_PERCENT,
    count: alerts.length,
    alerts,
  }
}

/** A Falcon episode of the sample node ND08890C04 that began 100 min ago and ended 10 min ago. */
export function resolvedLowEnergyAlertDtoFixture(now: number): ResolvedLowEnergyAlertDto {
  return {
    alert_type: 'LOW_ENERGY',
    kind: 'FALCON',
    hw_id: '1308890C04',
    source_id: 'ND08890C04-A-R',
    node: 'ND08890C04',
    ...locationOf('ND08890C04'),
    lowest_energy_percent: 10,
    threshold_percent: THRESHOLD_PERCENT,
    since: minutesAgo(now, 100),
    ended_at: minutesAgo(now, 10),
  }
}
