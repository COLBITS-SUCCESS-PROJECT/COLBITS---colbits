/** Sample inactive devices in the shape of GET /device/inactive (US17), on the sample nodes of the map. */
import type { InactiveDeviceDto } from '@/features/dashboard/api/inactiveDevices.dto'
import { toInactiveDevice } from '@/features/dashboard/api/inactiveDevices.mapper'
import type { InactiveDevice } from '@/features/dashboard/model/inactiveDevices.types'
import { NODE_FIXTURES } from './nodes.fixtures'

const MS_PER_MINUTE = 60_000
const FALCON_HOURS = 9
const SMAC_HOURS = 3

const minutesAgo = (now: number, minutes: number) =>
  new Date(now - minutes * MS_PER_MINUTE).toISOString()

/** Zone › substation › circuit of a sample node, the same ones the map shows. */
function locationOf(nodeName: string): Pick<InactiveDeviceDto, 'zone' | 'substation' | 'circuit'> {
  const node = NODE_FIXTURES.find((candidate) => candidate.name === nodeName)
  const { zone, substation, circuit } = node ?? {}
  if (!zone || !substation || !circuit) throw new Error(`No location for sample node ${nodeName}`)
  return { zone, substation, circuit }
}

type Sample = Pick<
  InactiveDeviceDto,
  'hw_id' | 'source_id' | 'kind' | 'node' | 'last_record_at' | 'inactive_now' | 'periods'
>

function device(sample: Sample, energy: number | null): InactiveDeviceDto {
  return {
    ...sample,
    ...locationOf(sample.node),
    threshold_hours: sample.kind === 'FALCON' ? FALCON_HOURS : SMAC_HOURS,
    energy_percent: energy,
    low_energy: energy === null ? null : energy < 30,
  }
}

/**
 * Three devices silent now and two that came back, in the backend order (F-40):
 * a SMAC that never reported, a Falcon silent for 21 h 30 min, a Falcon silent for 11 h 02 min,
 * then the Falcon resolved 10 h 40 min ago and the SMAC resolved 11 h 35 min ago.
 */
export function inactiveDeviceDtoFixtures(now: number): InactiveDeviceDto[] {
  return [
    device(
      {
        hw_id: '0504410C07',
        source_id: 'ND04410C07-T1-3',
        kind: 'SMAC',
        node: 'ND04410C07',
        last_record_at: null,
        inactive_now: true,
        periods: [],
      },
      null
    ),
    device(
      {
        hw_id: '1308890C04',
        source_id: 'ND08890C04-A-R',
        kind: 'FALCON',
        node: 'ND08890C04',
        last_record_at: minutesAgo(now, 1290),
        inactive_now: true,
        periods: [{ start: minutesAgo(now, 1290 - FALCON_HOURS * 60), end: null }],
      },
      12
    ),
    device(
      {
        hw_id: '1306420A08',
        source_id: 'ND06420A08-A-S',
        kind: 'FALCON',
        node: 'ND06420A08',
        last_record_at: minutesAgo(now, 662),
        inactive_now: true,
        // Declared inactive 9 h after its last record: 662 − 540 = 122 minutes ago.
        periods: [{ start: minutesAgo(now, 662 - FALCON_HOURS * 60), end: null }],
      },
      64
    ),
    device(
      {
        hw_id: '1307120D05',
        source_id: 'ND07120D05-A-T',
        kind: 'FALCON',
        node: 'ND07120D05',
        last_record_at: minutesAgo(now, 10),
        inactive_now: false,
        periods: [{ start: minutesAgo(now, 1200), end: minutesAgo(now, 640) }],
      },
      81
    ),
    device(
      {
        hw_id: '0502218B09',
        source_id: 'ND02218B09-T1-3',
        kind: 'SMAC',
        node: 'ND02218B09',
        last_record_at: minutesAgo(now, 5),
        inactive_now: false,
        periods: [{ start: minutesAgo(now, 900), end: minutesAgo(now, 695) }],
      },
      55
    ),
  ]
}

/** The same sample devices as domain objects, for component and rule tests. */
export function buildInactiveDevicesMock(now: number): InactiveDevice[] {
  return inactiveDeviceDtoFixtures(now).map(toInactiveDevice)
}
