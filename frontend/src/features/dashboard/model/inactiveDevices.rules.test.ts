/** Tests for the Inactive devices rules (server window, map location filter F-41, backend order F-40). */
import { describe, it, expect } from 'vitest'
import { buildInactiveDevicesSnapshot } from '@/mocks/data/inactiveDevices.fixtures'
import { selectInactiveDevices } from './inactiveDevices.rules'
import type { InactiveDevice, InactiveDevicesSnapshot } from './inactiveDevices.types'
import { ALL } from './liveMonitoring.constants'
import type { LocationFilter } from './scopeOptions'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const lastDay = buildInactiveDevicesSnapshot(NOW, 24)
const lastHour = buildInactiveDevicesSnapshot(NOW, 1)
const EVERYWHERE: LocationFilter = { zone: ALL, substation: ALL, circuit: ALL }

const minutesAgo = (minutes: number) => new Date(NOW - minutes * MS_PER_MINUTE)
const idsOf = (views: ReturnType<typeof selectInactiveDevices>) =>
  views.map((view) => view.device.id)

/** A device silent now whose last record is `lastMinutesAgo` old, declared inactive after its threshold. */
function silentDevice(id: string, kind: 'FALCON' | 'SMAC', lastMinutesAgo: number): InactiveDevice {
  const thresholdHours = kind === 'FALCON' ? 9 : 3
  const place = { id: '1', name: 'X' }
  return {
    id,
    sourceId: `S-${id}`,
    kind,
    nodeId: `N-${id}`,
    location: { zone: place, substation: place, circuit: place },
    thresholdHours,
    inactiveNow: true,
    lastRecordAt: minutesAgo(lastMinutesAgo),
    periods: [{ start: minutesAgo(lastMinutesAgo - thresholdHours * 60), end: null }],
  }
}

/** A last-day answer holding only `devices`, in the order given. */
const answer = (devices: InactiveDevice[], to = NOW): InactiveDevicesSnapshot => ({
  from: new Date(to - 24 * MS_PER_HOUR),
  to: new Date(to),
  devices,
})

describe('selectInactiveDevices', () => {
  it('keeps the backend order: never reported, oldest last record, then most recently resolved (F-40)', () => {
    const views = selectInactiveDevices(lastDay, EVERYWHERE)

    expect(idsOf(views)).toEqual([
      '0504410C07',
      '1308890C04',
      '1306420A08',
      '1307120D05',
      '0502218B09',
    ])
    expect(views.map((view) => view.totalMinutes)).toEqual([0, 750, 122, 560, 205])
    expect(views.map((view) => view.isInactiveNow)).toEqual([true, true, true, false, false])
  })

  it('measures the silence from the last record, not from the start of the period', () => {
    const [, falcon] = selectInactiveDevices(lastDay, EVERYWHERE)

    expect(falcon.silentMinutes).toBe(1290)
    expect(falcon.periods[0].minutes).toBe(750)
  })

  it('does not sort again: the devices stay in the order the backend sent them', () => {
    // Opposite of F-40 on purpose: the frontend must not repair it.
    const sent = [silentDevice('SMAC-1', 'SMAC', 300), silentDevice('FAL-1', 'FALCON', 600)]

    expect(idsOf(selectInactiveDevices(answer(sent), EVERYWHERE))).toEqual(['SMAC-1', 'FAL-1'])
  })

  it('measures the silence against the server time (to), not the browser clock (F-46)', () => {
    const serverTime = NOW - 30 * MS_PER_MINUTE
    const [view] = selectInactiveDevices(
      answer([silentDevice('FAL-1', 'FALCON', 600)], serverTime),
      EVERYWHERE
    )

    // The last record is 600 min before NOW, so 570 min before the server time.
    expect(view.silentMinutes).toBe(570)
    expect(view.periods[0].minutes).toBe(30)
  })

  it('keeps a device that never reported, first, with no silence time and no period', () => {
    const [never] = selectInactiveDevices(lastDay, EVERYWHERE)

    expect(never.device.id).toBe('0504410C07')
    expect(never.isInactiveNow).toBe(true)
    expect(never.silentMinutes).toBeNull()
    expect(never.periods).toEqual([])
  })

  it('trusts inactive_now from the backend instead of the periods', () => {
    const [device] = lastDay.devices.filter((candidate) => candidate.id === '1308890C04')
    const reportedAgain = { ...device, inactiveNow: false }

    const [view] = selectInactiveDevices(answer([reportedAgain]), EVERYWHERE)

    expect(view.isInactiveNow).toBe(false)
    expect(view.silentMinutes).toBeNull()
  })

  it('cuts ongoing periods to the last-hour answer but keeps the whole silence time', () => {
    const views = selectInactiveDevices(lastHour, EVERYWHERE)

    expect(idsOf(views)).toEqual(['0504410C07', '1308890C04', '1306420A08'])
    expect(views[1].totalMinutes).toBe(60)
    expect(views[1].silentMinutes).toBe(1290)
    expect(views[1].periods).toHaveLength(1)
  })

  it('keeps only the devices of the zone, substation or circuit selected on the map (F-41)', () => {
    const southCircuit = { ...EVERYWHERE, circuit: '3' } // CTO 1 · S/E SUR 1
    const northZone = { ...EVERYWHERE, zone: '1' }
    const southSubstation = { ...EVERYWHERE, substation: '2' }

    expect(idsOf(selectInactiveDevices(lastDay, southCircuit))).toEqual([
      '1306420A08',
      '1307120D05',
    ])
    expect(idsOf(selectInactiveDevices(lastDay, northZone))).toEqual([
      '0504410C07',
      '1308890C04',
      '0502218B09',
    ])
    expect(idsOf(selectInactiveDevices(lastDay, southSubstation))).toEqual([
      '1306420A08',
      '1307120D05',
    ])
  })

  it('matches by id, so a circuit name repeated in two substations is not mixed up', () => {
    // "CTO 1" exists in S/E NORTE 1 (id 1) and in S/E SUR 1 (id 3); the samples are only in the south one.
    const northCto1 = { ...EVERYWHERE, circuit: '1' }

    expect(selectInactiveDevices(lastDay, northCto1)).toEqual([])
  })

  it('follows the layers of the map: only Falcon on the fuses layer, only SMAC on the transformers layer', () => {
    const fuses = selectInactiveDevices(lastDay, EVERYWHERE, ['FUSES'])
    const transformers = selectInactiveDevices(lastDay, EVERYWHERE, ['TRANSFORMERS'])
    const both = selectInactiveDevices(lastDay, EVERYWHERE, ['FUSES', 'TRANSFORMERS'])

    expect(fuses.length).toBeGreaterThan(0)
    expect(transformers.length).toBeGreaterThan(0)
    expect(fuses.every((view) => view.device.kind === 'FALCON')).toBe(true)
    expect(transformers.every((view) => view.device.kind === 'SMAC')).toBe(true)
    expect(fuses.length + transformers.length).toBe(both.length)
    // Every layer off hides everything; the default (no layers given) shows everything
    expect(selectInactiveDevices(lastDay, EVERYWHERE, [])).toEqual([])
    expect(idsOf(selectInactiveDevices(lastDay, EVERYWHERE))).toEqual(idsOf(both))
  })

  it('follows the map search, by node or device id and whatever the case', () => {
    const [first] = selectInactiveDevices(lastDay, EVERYWHERE)

    expect(idsOf(selectInactiveDevices(lastDay, EVERYWHERE, undefined, first.device.id))).toEqual([
      first.device.id,
    ])
    const byNode = selectInactiveDevices(
      lastDay,
      EVERYWHERE,
      undefined,
      first.device.nodeId.toLowerCase()
    )
    expect(byNode.map((view) => view.device.id)).toContain(first.device.id)
    expect(selectInactiveDevices(lastDay, EVERYWHERE, undefined, 'no-such-thing')).toEqual([])
  })

  it('returns an empty list when there are no devices', () => {
    expect(selectInactiveDevices(answer([]), EVERYWHERE)).toEqual([])
  })
})
