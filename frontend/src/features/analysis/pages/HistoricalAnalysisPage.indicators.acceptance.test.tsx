/**
 * Acceptance tests — SCRUM-290 · US21 [F-68, F-69, F-70] Indicators panel with counts, durations and rankings.
 * Each test maps to an acceptance criterion in docs/specs/analysis/SCRUM-290.md §2.
 * Runs the whole page against the mocked node, fault-history and fault-indicator services (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { faultIndicatorsOf, indicatorNodesOf } from '@/mocks/handlers/indicators.handlers'
import { useAuthStore } from '@/stores/auth.store'
import { FAULT_INDICATORS_ENDPOINT } from '../api/indicators.api'
import type { FaultIndicatorsResponseDto } from '../api/indicators.dto'
import { formatSeconds } from '../model/indicatorFormat'
import { RANKING_ROWS } from '../model/indicators.constants'
import { openHistoryAs, recordHistoryRequests, TEST_TODAY } from './historyTestUtils'

vi.mock('recharts', async (importOriginal) =>
  (await import('@/mocks/recharts.mock')).mockRecharts(importOriginal)
)

const SUBSTATIONS = 'Fallas por subestación'
const CIRCUITS = 'Fallas por circuito'
const NODES = 'Nodos con más fallas'
const LONGEST = 'Fallas más largas'
const MINUTE_SECONDS = 60

/** Query parameters of every GET /faults/indicators the page sent, in order. */
function recordIndicatorRequests(): URLSearchParams[] {
  const requests: URLSearchParams[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith(FAULT_INDICATORS_ENDPOINT)) requests.push(url.searchParams)
  })
  return requests
}

/** What the mock answers to a request of this user, computed apart from the page. */
function expectedFor(
  token: string,
  params: URLSearchParams | undefined
): FaultIndicatorsResponseDto {
  const query = params ?? new URLSearchParams()
  const day = (key: string) => query.get(key)?.slice(0, 10) ?? ''
  return faultIndicatorsOf(
    indicatorNodesOf(token, query),
    day('from'),
    day('to'),
    query.get('min_duration_filter') === 'true'
  )
}

/** The most recent request, i.e. the one the cards show now. */
const latest = (requests: URLSearchParams[]) => requests[requests.length - 1]

const card = (name: string) => within(screen.getByRole('region', { name }))
const itemsOf = (name: string) =>
  card(name)
    .getAllByRole('listitem')
    .map((item) => item.textContent)
const rowHeadersOf = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent)
const columnOf = (name: string, index: number) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[index]?.textContent)

describe('SCRUM-290 · US21 — fault indicators and rankings', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TEST_TODAY)
  })
  afterEach(async () => {
    // Unmount first: switching the language back must not update a page that is still on screen.
    cleanup()
    vi.useRealTimers()
    server.events.removeAllListeners()
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterAll(() => server.close())

  it('AC1 (F-68): shows the exact fault count of every substation and circuit in scope', async () => {
    const requests = recordIndicatorRequests()
    await openHistoryAs(MOCK_TOKENS.DEV)
    await screen.findByRole('list', { name: SUBSTATIONS })

    const expected = expectedFor(MOCK_TOKENS.DEV, requests[0])
    expect(expected.by_substation.length).toBeGreaterThan(1)
    expect(itemsOf(SUBSTATIONS)).toEqual(
      expected.by_substation.map((row) => `${row.substation_name}${row.fault_count}`)
    )
    // "CTO 1" exists in two substations, so each one also names its substation.
    const repeated = (name: string) =>
      expected.by_circuit.filter((row) => row.circuit_name === name).length > 1
    expect(itemsOf(CIRCUITS)).toEqual(
      expected.by_circuit.map(
        (row) =>
          `${repeated(row.circuit_name) ? `${row.circuit_name} · ${row.substation_name}` : row.circuit_name}${row.fault_count}`
      )
    )
    const sum = expected.by_circuit.reduce((total, row) => total + row.fault_count, 0)
    expect(sum).toBe(expected.total_faults)
  })

  it('AC2 (F-69): with the filter on, the average and maximum come only from faults over 1 minute, and a label says so', async () => {
    const requests = recordIndicatorRequests()
    await openHistoryAs(MOCK_TOKENS.NORTH)
    await screen.findByText('Filtro de duración mínima desactivado')
    expect(requests[0]?.has('min_duration_filter')).toBe(false)

    await userEvent.click(screen.getByRole('switch', { name: 'Filtro de duración mínima' }))
    await screen.findByText('Filtro de duración mínima activo: más de 1 min')

    const request = latest(requests)
    expect(request?.get('min_duration_filter')).toBe('true')
    const filtered = expectedFor(MOCK_TOKENS.NORTH, request)
    const unfiltered = expectedFor(MOCK_TOKENS.NORTH, requests[0])
    // The period has faults of a minute or less, and the filter left them out.
    expect(filtered.total_faults).toBeLessThan(unfiltered.total_faults)
    expect(filtered.longest_faults.every((fault) => fault.duration_seconds > MINUTE_SECONDS)).toBe(
      true
    )
    expect(
      card(LONGEST)
        .getAllByRole('definition')
        .map((value) => value.textContent)
    ).toEqual([
      formatSeconds(filtered.duration.average_seconds ?? 0, 'es-CO'),
      formatSeconds(filtered.duration.max_seconds ?? 0, 'es-CO'),
      String(filtered.total_faults),
    ])
    expect(
      card(SUBSTATIONS).getByText(
        'Conteo comparativo en el periodo seleccionado · solo fallas de más de 1 min'
      )
    ).toBeVisible()
  })

  it('AC3 (F-70): ranks the nodes by fault count and the faults by duration, longest first', async () => {
    const requests = recordIndicatorRequests()
    await openHistoryAs(MOCK_TOKENS.DEV)
    await screen.findByRole('table', { name: NODES })

    const expected = expectedFor(MOCK_TOKENS.DEV, requests[0])
    expect(rowHeadersOf(NODES)).toEqual(
      expected.node_ranking.slice(0, RANKING_ROWS).map((row) => row.node)
    )
    const counts = columnOf(NODES, 1).map(Number)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))

    const longest = expected.longest_faults.slice(0, RANKING_ROWS)
    expect(rowHeadersOf(LONGEST)).toEqual(longest.map((fault) => fault.node))
    expect(columnOf(LONGEST, 1)).toEqual(
      longest.map((fault) => formatSeconds(fault.duration_seconds, 'es-CO'))
    )
    const seconds = longest.map((fault) => fault.duration_seconds)
    expect(seconds).toEqual([...seconds].sort((a, b) => b - a))
  })

  it('AC4 (F-65): the indicators cover the same days as the charts and the deepest scope element selected', async () => {
    const requests = recordIndicatorRequests()
    const historyRequests = recordHistoryRequests()
    await openHistoryAs(MOCK_TOKENS.NORTH)
    await screen.findByRole('list', { name: CIRCUITS })

    const [first] = requests
    const [chart] = historyRequests
    expect(first?.get('from')).toBe(chart?.get('from'))
    const lastDay = new Date(`${chart?.get('to')?.slice(0, 10) ?? ''}T00:00:00Z`)
    lastDay.setUTCDate(lastDay.getUTCDate() - 1)
    expect(first?.get('to')).toBe(`${lastDay.toISOString().slice(0, 10)}T23:59:59.999-05:00`)

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Circuito' }), '1')
    await waitFor(() => expect(latest(requests)?.get('circuit_id')).toBe('1'))
    expect(latest(requests)?.has('zone_id')).toBe(false)
    const circuit = expectedFor(MOCK_TOKENS.NORTH, latest(requests))
    await waitFor(() =>
      expect(itemsOf(CIRCUITS)).toEqual(
        circuit.by_circuit.map((row) => `${row.circuit_name}${row.fault_count}`)
      )
    )
    expect(itemsOf(CIRCUITS)).toHaveLength(1)

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Nodo' }), 'ND04821A07')
    await waitFor(() => expect(latest(requests)?.get('node_id')).toBe('ND04821A07'))
    expect(latest(requests)?.has('circuit_id')).toBe(false)
  })

  it('AC5: says when there are no faults, and when the filter left none', async () => {
    await openHistoryAs(MOCK_TOKENS.NO_SCOPE, false)

    const empty = 'No hay fallas registradas en este periodo y alcance.'
    await waitFor(() => expect(card(SUBSTATIONS).getByText(empty)).toBeVisible())
    for (const name of [CIRCUITS, NODES, LONGEST]) expect(card(name).getByText(empty)).toBeVisible()

    await userEvent.click(screen.getByRole('switch', { name: 'Filtro de duración mínima' }))

    const filtered = 'No hay fallas de más de 1 min en este periodo y alcance.'
    await waitFor(() => expect(card(LONGEST).getByText(filtered)).toBeVisible())
    expect(card(NODES).getByText(filtered)).toBeVisible()
  })

  it('AC6: when the service fails, each card says so and retrying asks again', async () => {
    const requests = recordIndicatorRequests()
    server.use(
      http.get(`*${FAULT_INDICATORS_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Error', detail: 'down', status: 500 }, { status: 500 })
      )
    )
    await openHistoryAs(MOCK_TOKENS.NORTH)

    await waitFor(() =>
      expect(card(SUBSTATIONS).getByRole('alert')).toHaveTextContent('No se pudo cargar')
    )
    server.resetHandlers()
    await userEvent.click(card(LONGEST).getByRole('button', { name: 'Reintentar' }))

    await screen.findByRole('table', { name: LONGEST })
    expect(requests.length).toBeGreaterThan(1)
  })

  it('AC7: the indicators speak English when the user switches language', async () => {
    await openHistoryAs(MOCK_TOKENS.NORTH)
    await screen.findByRole('list', { name: SUBSTATIONS })

    await act(() => i18n.changeLanguage('en'))

    expect(screen.getByRole('region', { name: 'Faults by substation' })).toBeVisible()
    expect(screen.getByRole('table', { name: 'Top failed nodes' })).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Minimum duration filter' })).toBeVisible()
    expect(screen.getByText('Minimum duration filter off')).toBeVisible()
  })
})
