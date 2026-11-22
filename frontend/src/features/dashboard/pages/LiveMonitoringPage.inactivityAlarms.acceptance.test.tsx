/**
 * Acceptance tests — SCRUM-115 · US17 AC6: the inactivity alarm in the Active and Resolved tabs (F-38, F-39).
 * Runs the whole page against the mocked services (MSW). GET /faults does not list inactivity
 * alarms; they come from the periods of GET /device/inactive, which answers like the backend.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import {
  inactiveDeviceDtoFixtures,
  inactiveDevicesResponseFixture,
} from '@/mocks/data/inactiveDevices.fixtures'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { STEP_MS, letTimePass, startSimulatedTime } from '@/mocks/liveRefresh'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { formatClockTime } from '@/utils/formatDateTime'
import { INACTIVE_DEVICES_ENDPOINT } from '../api/inactiveDevices.api'
import type { InactiveDeviceDto } from '../api/inactiveDevices.dto'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
/** NF-01: a change reaches the open panel no more than 20 s after it is stored. */
const NF01_LIMIT_MS = 20_000
const SILENT_NODE = 'ND08890C04'
const alarmOf = (node: string) => `Inactividad de dispositivo · ${node}`

function openPanel() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.DEV)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
}

type Panel = ReturnType<typeof openPanel>

/** Inactivity alarm cards in the panel, by node. */
const inactivityAlarmsIn = (panel: Panel) =>
  panel
    .queryAllByRole('article')
    .map((card) => card.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Inactividad de dispositivo'))
    .map((label) => label.split(' · ')[1])
    .sort()

/** From now on GET /device/inactive answers only this device, in any window. */
function deviceServiceAnswers(device: InactiveDeviceDto) {
  server.use(
    http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, ({ request }) => {
      const hours = Number(new URL(request.url).searchParams.get('hours'))
      const answer = inactiveDevicesResponseFixture(Date.now(), hours, [])
      return HttpResponse.json({ ...answer, count: 1, devices: [device] })
    })
  )
}

/** The sample Falcon silent for 21 h 30 min (inactive since 12 h 30 min ago). */
function silentFalcon(): InactiveDeviceDto {
  const device = inactiveDeviceDtoFixtures(Date.now()).find((dto) => dto.node === SILENT_NODE)
  if (!device) throw new Error(`No sample device on ${SILENT_NODE}`)
  return device
}

describe('SCRUM-115 · US17 — inactivity alarm in the Active and Resolved tabs (AC6)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC6 — the alarm opens in Active (F-38), and after a new record it moves to Resolved with that end (F-39)', async () => {
    startSimulatedTime()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Given an active Falcon whose last record passed its 9 h threshold
    const silent = silentFalcon()
    deviceServiceAnswers(silent)
    const panel = openPanel()

    // Then an inactivity alarm is open in the Active tab
    const open = await panel.findByRole('article', { name: alarmOf(SILENT_NODE) })
    expect(within(open).getByText('Abierta')).toBeInTheDocument()

    // Given the device stores a new record
    const recordAt = new Date(Date.now())
    deviceServiceAnswers({
      ...silent,
      last_record_at: recordAt.toISOString(),
      inactive_now: false,
      periods: silent.periods.map((period) => ({ ...period, end: recordAt.toISOString() })),
    })

    // When the panel refreshes (no manual action), the alarm leaves Active within NF-01
    const start = Date.now()
    while (panel.queryByRole('article', { name: alarmOf(SILENT_NODE) })) {
      expect(Date.now() - start).toBeLessThanOrEqual(NF01_LIMIT_MS)
      await letTimePass(STEP_MS)
    }

    // Then it is in Resolved, ending at the timestamp of that record
    await user.click(panel.getByRole('tab', { name: 'Resueltas' }))
    const resolved = await panel.findByRole('article', { name: alarmOf(SILENT_NODE) })
    expect(within(resolved).getByText('Resuelta')).toBeInTheDocument()
    expect(
      within(resolved).getByText(new RegExp(`cerrada ${formatClockTime(recordAt, 'es-CO')}`))
    ).toBeInTheDocument()
  })

  it('AC6 — the alarms follow the map filter like the other alarms (F-56)', async () => {
    const panel = openPanel()
    await panel.findByRole('article', { name: alarmOf(SILENT_NODE) })

    // Open alarms of the sample: the two Falcons silent now
    expect(inactivityAlarmsIn(panel)).toEqual(['ND06420A08', 'ND08890C04'])

    // Circuit CTO 1 of S/E SUR 1 on the map toolbar
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Circuito' }),
      'CTO 1 · S/E SUR 1'
    )
    expect(inactivityAlarmsIn(panel)).toEqual(['ND06420A08'])
  })

  it('AC6 — a device that never reported has no alarm in the panel, only in the Inactive devices tab', async () => {
    const panel = openPanel()
    await panel.findByRole('article', { name: alarmOf(SILENT_NODE) })

    expect(inactivityAlarmsIn(panel)).not.toContain('ND04410C07')

    await userEvent.click(panel.getByRole('tab', { name: 'Resueltas' }))
    await panel.findByRole('article', { name: alarmOf('ND07120D05') })
    expect(inactivityAlarmsIn(panel)).not.toContain('ND04410C07')
  })
})
