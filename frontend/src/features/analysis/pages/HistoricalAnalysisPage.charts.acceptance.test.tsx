/**
 * Acceptance tests — SCRUM-289 · US20 [F-66, F-67] Trend chart of faults and voltage alarms, and phase distribution.
 * Each test maps to an acceptance criterion in docs/specs/analysis/SCRUM-289.md §2.
 * Runs the whole page against the mocked node and fault-history services (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { faultHistoryOf } from '@/mocks/handlers/history.handlers'
import { useAuthStore } from '@/stores/auth.store'
import { FAULT_HISTORY_ENDPOINT } from '../api/history.api'
import type { FaultHistoryResponseDto } from '../api/history.dto'
import { openHistoryAs, recordHistoryRequests, TEST_TODAY } from './historyTestUtils'

vi.mock('recharts', async (importOriginal) =>
  (await import('@/mocks/recharts.mock')).mockRecharts(importOriginal)
)

const NORTH_NODES = ['ND04821A07', 'ND01120A02', 'ND06102B03', 'ND07740D02']
const LAST_MONTH = ['2026-10-19', '2026-11-19'] as const

const answerWith = (body: Partial<FaultHistoryResponseDto>) =>
  server.use(
    http.get(`*${FAULT_HISTORY_ENDPOINT}`, () =>
      HttpResponse.json({ ...faultHistoryOf([], ...LAST_MONTH), ...body })
    )
  )

const trendRows = () =>
  within(screen.getByRole('table', { name: 'Fallas por intervalo' }))
    .getAllByRole('row')
    .slice(1)

describe('SCRUM-289 · US20 — fault trend and phase distribution', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_TODAY)
  })
  afterEach(async () => {
    vi.useRealTimers()
    server.events.removeAllListeners()
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterAll(() => server.close())

  it('AC1 (F-66): the trend shows fuse faults and voltage alarms of every day of the range', async () => {
    await openHistoryAs(MOCK_TOKENS.NORTH)

    const expected = faultHistoryOf(NORTH_NODES, ...LAST_MONTH)
    const card = within(screen.getByRole('region', { name: 'Tendencia de fallas en el tiempo' }))
    expect(card.getByText('Aperturas de fusible y ausencias de tensión por día')).toBeVisible()
    expect(trendRows()).toHaveLength(32)
    const fuses = trendRows().map((row) => Number(row.children[1]?.textContent))
    const voltages = trendRows().map((row) => Number(row.children[2]?.textContent))
    expect(fuses).toEqual(expected.series.map((point) => point.fuse_faults))
    expect(voltages).toEqual(expected.series.map((point) => point.voltage_alarms))
    expect(card.getByText(String(expected.totals.fuse_faults))).toBeVisible()
  })

  it('AC2 (F-66): a long range is drawn per week', async () => {
    const requests = recordHistoryRequests()
    await openHistoryAs(MOCK_TOKENS.NORTH)

    await userEvent.click(screen.getByRole('button', { name: 'Último año' }))

    await screen.findByText('Aperturas de fusible y ausencias de tensión por semana')
    expect(requests[requests.length - 1]?.get('from')).toBe('2025-11-19T00:00:00-05:00')
    expect(trendRows()).toHaveLength(53)
  })

  it('renders the SCRUM-283 trend when the backend has no phase breakdown', async () => {
    answerWith({
      totals: { fuse_faults: 4, voltage_alarms: 2 },
      series: [{ start: '2026-10-19T05:00:00.000Z', fuse_faults: 4, voltage_alarms: 2 }],
      phase_distribution: undefined,
    })
    await openHistoryAs(MOCK_TOKENS.NORTH)
    expect(
      await screen.findByText('La distribución por fases aún no está disponible.')
    ).toBeVisible()
    expect(trendRows()[0]).toHaveTextContent('42')
  })

  it('AC3 (F-67): the distribution shows the single-, two- and three-phase counts with their share', async () => {
    await openHistoryAs(MOCK_TOKENS.NORTH)

    const { phase_distribution: phases } = faultHistoryOf(NORTH_NODES, ...LAST_MONTH)
    const card = within(
      screen.getByRole('region', { name: 'Distribución por clasificación de fases' })
    )
    expect(
      card.getByRole('img', {
        name: `Monofásicas ${phases.single_phase}, bifásicas ${phases.two_phase}, trifásicas ${phases.three_phase}`,
      })
    ).toBeInTheDocument()
    expect(card.getAllByRole('listitem')).toHaveLength(3)
  })

  it('AC4 (F-67): R, S and T opening on one fuse set within 3 minutes count as one three-phase fault', async () => {
    // The backend groups the openings (F-48 to F-50); the view shows its single three_phase event.
    answerWith({
      totals: { fuse_faults: 1, voltage_alarms: 0 },
      phase_distribution: { single_phase: 0, two_phase: 0, three_phase: 1, unclassified: 0 },
    })
    await openHistoryAs(MOCK_TOKENS.NORTH)

    const card = within(
      screen.getByRole('region', { name: 'Distribución por clasificación de fases' })
    )
    expect(card.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Monofásica0  (0%)',
      'Bifásica0  (0%)',
      'Trifásica1  (100%)',
    ])
  })

  it('AC5: a period without faults says so in both charts', async () => {
    answerWith({})
    await openHistoryAs(MOCK_TOKENS.NORTH, false)

    await waitFor(() =>
      expect(
        screen.getAllByText('No hay fallas registradas en este periodo y alcance.')
      ).toHaveLength(2)
    )
  })

  it('AC6: when the history cannot be loaded, both charts offer to retry', async () => {
    server.use(
      http.get(`*${FAULT_HISTORY_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Error', detail: 'boom', status: 500 }, { status: 500 })
      )
    )
    await openHistoryAs(MOCK_TOKENS.NORTH, false)

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(2)
    )
    server.resetHandlers()
    await userEvent.click(screen.getAllByRole('button', { name: 'Reintentar' })[0]!)
    expect(await screen.findByRole('table', { name: 'Fallas por intervalo' })).toBeInTheDocument()
  })

  it('AC7 (US30): every text of the view switches to English', async () => {
    await openHistoryAs(MOCK_TOKENS.NORTH)

    await i18n.changeLanguage('en')

    expect(await screen.findByRole('button', { name: 'Last month' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Substation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fault trend over time' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Distribution by phase classification' })
    ).toBeInTheDocument()
    expect(screen.getByText('Monophasic')).toBeInTheDocument()
  })
})
