/** Sample inactive devices matching the Figma frame "Fault Panel · Inactive devices" (SCRUM-115). */
import type { InactiveDevice } from '@/features/dashboard/model/inactiveDevices.types'

const MS_PER_MINUTE = 60_000

const minutesAgo = (now: number, minutes: number) => new Date(now - minutes * MS_PER_MINUTE)

/** Two devices silent now (12 h 30 min and 3 h 42 min) and two that already came back. */
export function buildInactiveDevicesMock(now: number): InactiveDevice[] {
  const closedFalconStart = minutesAgo(now, 20 * 60)
  const closedSmacStart = minutesAgo(now, 15 * 60)
  return [
    {
      id: 'SMAC-0221',
      kind: 'SMAC',
      nodeId: 'ND02218B09',
      zone: 'Norte',
      substation: 'SE-Norte',
      circuit: 'CR-12',
      thresholdHours: 3,
      periods: [
        { start: closedSmacStart, end: new Date(closedSmacStart.getTime() + 205 * MS_PER_MINUTE) },
      ],
    },
    {
      id: 'FAL-07311-A',
      kind: 'FALCON',
      nodeId: 'ND07311A06',
      zone: 'Sur',
      substation: 'SE-Sur',
      circuit: 'CR-25',
      thresholdHours: 9,
      periods: [
        {
          start: closedFalconStart,
          end: new Date(closedFalconStart.getTime() + 560 * MS_PER_MINUTE),
        },
      ],
    },
    {
      id: 'SMAC-0882',
      kind: 'SMAC',
      nodeId: 'ND08812B05',
      zone: 'Centro',
      substation: 'SE-Centro',
      circuit: 'CR-03',
      thresholdHours: 3,
      periods: [{ start: minutesAgo(now, 222), end: null }],
    },
    {
      id: 'FAL-03090-C',
      kind: 'FALCON',
      nodeId: 'ND03090C04',
      zone: 'Sur',
      substation: 'SE-Sur',
      circuit: 'CR-25',
      thresholdHours: 9,
      periods: [{ start: minutesAgo(now, 750), end: null }],
    },
  ]
}
