/**
 * Acceptance tests — SCRUM-288 · US20 [F-64, F-65] Historical view: date presets, custom range, scope filter.
 * Each test maps to an acceptance criterion in docs/specs/analysis/SCRUM-288.md §2.
 * Runs the whole page against the mocked node and fault-history services (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { faultHistoryOf } from '@/mocks/handlers/history.handlers'
import { useAuthStore } from '@/stores/auth.store'
import { http, HttpResponse } from 'msw'
import { SCOPE_NODES_ENDPOINT } from '../api/history.api'
import { fromIsoDate } from '../model/periodRange'
import { openHistoryAs, recordHistoryRequests, TEST_TODAY } from './historyTestUtils'

vi.mock('recharts', async (importOriginal) =>
  (await import('@/mocks/recharts.mock')).mockRecharts(importOriginal)
)

const DAY_MS = 86_400_000
const last = <T,>(items: T[]): T | undefined => items[items.length - 1]
const rangeOf = (params: URLSearchParams | undefined) => [
  params?.get('from')?.slice(0, 10),
  params?.get('to')?.slice(0, 10),
]
/** Total next to a series name in the trend legend. */
const legendTotal = (name: string) =>
  screen
    .getAllByRole('listitem')
    .find((item) => item.firstElementChild?.nextElementSibling?.textContent === name)
    ?.lastElementChild?.textContent

describe('SCRUM-288 · US20 — period presets, custom range and scope filter', () => {
  let requests: URLSearchParams[]

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_TODAY)
    requests = recordHistoryRequests()
  })
  afterEach(() => {
    vi.useRealTimers()
    server.events.removeAllListeners()
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
  })
  afterAll(() => server.close())

  it('AC1 (F-64): the view opens on "Last month", which spans the preceding 31 days', async () => {
    await openHistoryAs(MOCK_TOKENS.DEV)

    expect(screen.getByRole('button', { name: 'Último mes' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const [from, to] = rangeOf(last(requests))
    expect([from, to]).toEqual(['2026-10-19', '2026-11-20'])
    const span = (fromIsoDate(to ?? '').getTime() - fromIsoDate(from ?? '').getTime()) / DAY_MS
    expect(Math.round(span)).toBe(32)
  })

  it.each([
    ['Última semana', '2026-11-12'],
    ['Últimos 6 meses', '2026-05-19'],
    ['Último año', '2025-11-19'],
  ])('AC2 (F-64): the "%s" preset queries from %s to today', async (chip, from) => {
    await openHistoryAs(MOCK_TOKENS.DEV)

    await userEvent.click(screen.getByRole('button', { name: chip }))

    await waitFor(() => expect(rangeOf(last(requests))).toEqual([from, '2026-11-20']))
    expect(screen.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC3 (F-64): a custom range queries exactly the chosen dates', async () => {
    await openHistoryAs(MOCK_TOKENS.DEV)

    await userEvent.click(screen.getByRole('button', { name: 'Rango personalizado' }))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-27' } })

    await waitFor(() => expect(rangeOf(last(requests))).toEqual(['2026-09-01', '2026-09-28']))
    const days = within(screen.getByRole('table', { name: 'Fallas por intervalo' }))
    await waitFor(() => expect(days.getAllByRole('row')).toHaveLength(1 + 27))
  })

  it('AC4 (F-64): an invalid custom range is explained and never queried', async () => {
    await openHistoryAs(MOCK_TOKENS.DEV)
    await userEvent.click(screen.getByRole('button', { name: 'Rango personalizado' }))
    const sent = requests.length

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-25' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha de inicio debe ser anterior o igual a la de fin.'
    )
    expect(requests).toHaveLength(sent)
  })

  it('AC5 (F-65): a user with Circuits A and B who picks Circuit A sees only Circuit A', async () => {
    // The north user has CTO 1 (id 1) and CTO 2 (id 2) of S/E NORTE 1.
    await openHistoryAs(MOCK_TOKENS.NORTH)
    const circuit = screen.getByRole('combobox', { name: 'Circuito' })
    await waitFor(() =>
      expect(
        within(circuit)
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['Todos los circuitos', 'CTO 1', 'CTO 2'])
    )

    await userEvent.selectOptions(circuit, '1')

    await waitFor(() => expect(last(requests)?.get('circuit_id')).toBe('1'))
    const expected = faultHistoryOf(['ND04821A07', 'ND01120A02'], '2026-10-19', '2026-11-19')
    await waitFor(() =>
      expect(legendTotal('Aperturas de fusible')).toBe(String(expected.totals.fuse_faults))
    )
    expect(legendTotal('Ausencias de tensión')).toBe(String(expected.totals.voltage_alarms))
    expect(
      within(screen.getByRole('combobox', { name: 'Nodo' }))
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Todos los nodos', 'ND01120A02', 'ND04821A07'])
  })

  it('AC6 (F-65): the filter only offers places inside the user scope', async () => {
    await openHistoryAs(MOCK_TOKENS.SOUTH)

    const zone = screen.getByRole('combobox', { name: 'Zona' })
    await waitFor(() =>
      expect(
        within(zone)
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['Todas las zonas', 'Zona Sur'])
    )
  })

  it('AC7 (F-65): if the scope list fails, the view still shows the whole user scope and says so', async () => {
    server.use(
      http.get(`*${SCOPE_NODES_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Error', detail: 'boom', status: 500 }, { status: 500 })
      )
    )
    await openHistoryAs(MOCK_TOKENS.NORTH)

    expect(
      await screen.findByText(
        'No se pudo cargar tu alcance de red. Se muestra toda la información a la que tienes acceso.'
      )
    ).toBeVisible()
    expect(last(requests)?.has('circuit_id')).toBe(false)
  })
})
