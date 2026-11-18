/** DemoScenarioPanel — who sees it, what it offers, running an action and each refusal (SCRUM-218 AC1–AC5, AC7, AC8). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { nodeDetailFixture } from '@/mocks/data/nodeDetail.fixtures'
import { NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { SCENARIOS_STATUS_FIXTURE, scenarioResultFixture } from '@/mocks/data/scenarios.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { formatTime } from '@/utils/formatDateTime'
import { toNodeDetail } from '../../api/nodeDetail.mapper'
import type { RunScenarioRequestDto } from '../../api/scenarios.dto'
import { SCENARIOS_ENDPOINT } from '../../api/scenarios.api'
import type { NodeDetail } from '../../model/nodeDetail.types'
import { DemoScenarioPanel } from './DemoScenarioPanel'

const ADMIN: AuthUser = { id: '1', name: 'Admin', email: 'admin@colbits.com', role: 'ADMIN' }
const VIEWER: AuthUser = { id: '2', name: 'Consulta', email: 'client@colbits.com', role: 'VIEWER' }
const EVENT_AT = new Date('2026-11-15T15:42:05Z')
const SCENARIOS = `*${SCENARIOS_ENDPOINT}`

/** The F-27 example of the mock: set A (R, S, T), set B (R open with no voltage, S) and one SMAC. */
const EXAMPLE_NODE = NODE_FIXTURES.find((node) => node.name === 'ND04821A07')
if (!EXAMPLE_NODE) throw new Error('the F-27 example node is missing from the mock')
const EXAMPLE: NodeDetail = toNodeDetail(nodeDetailFixture(EXAMPLE_NODE))

function renderPanel(detail: NodeDetail = EXAMPLE, user: AuthUser = ADMIN) {
  useAuthStore.getState().setSession(user, MOCK_LOGIN_TOKENS.ADMIN)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DemoScenarioPanel detail={detail} />
    </QueryClientProvider>
  )
}

const findPanel = async () =>
  within(await screen.findByRole('region', { name: 'Escenarios de demo' }))

/** From now on GET /scenarios answers `body` (or `status`), counting the requests. */
function scenariosAnswer(body: JsonBodyType, status = 200) {
  const requests = { count: 0 }
  server.use(
    http.get(SCENARIOS, () => {
      requests.count += 1
      return HttpResponse.json(body, { status })
    })
  )
  return requests
}

/** From now on POST /scenarios answers like the backend after storing the action, keeping each body. */
function recordRuns() {
  const bodies: RunScenarioRequestDto[] = []
  server.use(
    http.post(SCENARIOS, async ({ request }) => {
      const body = (await request.json()) as RunScenarioRequestDto
      bodies.push(body)
      return HttpResponse.json(
        { ...scenarioResultFixture(body), recorded_at: EVENT_AT.toISOString() },
        { status: 201 }
      )
    })
  )
  return bodies
}

const optionsOf = (select: HTMLElement) =>
  [...select.querySelectorAll('option')].map((option) => option.textContent)

describe('DemoScenarioPanel', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('offers the administrator the fuse and transformer actions of the node (AC1)', async () => {
    renderPanel()
    const panel = await findPanel()

    const fuses = within(panel.getByRole('region', { name: 'Escenarios de fusible' }))
    expect(optionsOf(fuses.getByRole('combobox', { name: 'Fusible' }))).toEqual([
      'ND04821A07-A-R · Cerrado · con tensión',
      'ND04821A07-A-S · Cerrado · con tensión',
      'ND04821A07-A-T · Cerrado · con tensión',
      'ND04821A07-B-R · Abierto · sin tensión',
      'ND04821A07-B-S · Sin dato · tensión sin dato',
    ])
    expect(fuses.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Abrir fusible',
      'Cerrar fusible',
      'Cortar tensión',
      'Restaurar tensión',
    ])
    const transformer = within(panel.getByRole('region', { name: 'Escenarios del transformador' }))
    expect(transformer.getByRole('combobox', { name: 'Transformador' })).toHaveValue(
      'ND04821A07-T1'
    )
    expect(optionsOf(transformer.getByRole('combobox', { name: 'Fase' }))).toEqual([
      'Fase A · 127,1 V',
      'Fase B · 126,8 V',
      'Fase C · 127,4 V',
    ])
    expect(transformer.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Quitar fase',
      'Restaurar fase',
    ])
  })

  it('shows nothing to a consultation user and never asks for the scenarios (AC2)', async () => {
    const requests = scenariosAnswer(SCENARIOS_STATUS_FIXTURE)
    renderPanel(EXAMPLE, VIEWER)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(requests.count).toBe(0)
  })

  it.each([
    [
      'demo mode is off (NF-03)',
      { enabled: false, actions: SCENARIOS_STATUS_FIXTURE.actions },
      200,
    ],
    ['the backend has no scenario service', { title: 'Not Found' }, 404],
  ])('shows nothing when %s (AC3)', async (_case, body, status) => {
    const requests = scenariosAnswer(body, status)
    renderPanel()

    await waitFor(() => expect(requests.count).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('opens the chosen fuse and confirms it with the time of the event (AC4)', async () => {
    const runs = recordRuns()
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    await user.selectOptions(panel.getByRole('combobox', { name: 'Fusible' }), 'ND04821A07-A-S')
    await user.click(panel.getByRole('button', { name: 'Abrir fusible' }))

    expect(await panel.findByText(/^Fusible abierto en ND04821A07-A-S/)).toHaveTextContent(
      `Fusible abierto en ND04821A07-A-S (${formatTime(EVENT_AT, 'es-CO')}).`
    )
    expect(runs).toEqual([{ action: 'OPEN_FUSE', target: 'ND04821A07-A-S' }])
  })

  it('drops the chosen phase of the transformer (AC5)', async () => {
    const runs = recordRuns()
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    await user.selectOptions(panel.getByRole('combobox', { name: 'Fase' }), 'B')
    await user.click(panel.getByRole('button', { name: 'Quitar fase' }))

    expect(await panel.findByRole('status')).toHaveTextContent(/^Fase B quitada en ND04821A07-T1/)
    expect(runs).toEqual([{ action: 'DROP_PHASE', target: 'ND04821A07-T1', channel: 'B' }])
  })

  it('offers only the phases a two-phase transformer has, and none when it reports no voltage (AC5)', async () => {
    const [smac] = EXAMPLE.transformers
    if (!smac) throw new Error('the example has no transformer')
    renderPanel({
      ...EXAMPLE,
      transformers: [
        { ...smac, id: 'ND04821A07-T1-2', voltages: { a: 127.1, b: 0, c: null } },
        { ...smac, id: 'ND04821A07-T2-3', voltages: { a: null, b: null, c: null } },
      ],
    })
    const panel = await findPanel()
    const phase = panel.getByRole('combobox', { name: 'Fase' })

    expect(optionsOf(phase)).toEqual(['Fase A · 127,1 V', 'Fase B · 0 V'])
    await userEvent
      .setup()
      .selectOptions(panel.getByRole('combobox', { name: 'Transformador' }), 'ND04821A07-T2-3')
    expect(optionsOf(phase)).toEqual([])
    expect(panel.getByRole('button', { name: 'Quitar fase' })).toBeDisabled()
  })

  it('takes the phases of a transformer that never reported from its id (AC5)', async () => {
    const [smac] = EXAMPLE.transformers
    if (!smac) throw new Error('the example has no transformer')
    renderPanel({
      ...EXAMPLE,
      transformers: [
        {
          ...smac,
          id: 'ND04821A07-T1-2',
          voltages: { a: null, b: null, c: null },
          lastRecordAt: null,
        },
      ],
    })
    const panel = await findPanel()

    expect(optionsOf(panel.getByRole('combobox', { name: 'Fase' }))).toEqual(['Fase A', 'Fase B'])
  })

  it('has no phase picker when no transformer action needs a phase (AC8)', async () => {
    scenariosAnswer({
      enabled: true,
      actions: [
        {
          action: 'OVERLOAD',
          target: 'TRANSFORMER',
          channel_required: false,
          effect: 'Load 120 %',
        },
      ],
    })
    const runs = recordRuns()
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    expect(panel.queryByRole('combobox', { name: 'Fase' })).not.toBeInTheDocument()
    await user.click(panel.getByRole('button', { name: 'OVERLOAD' }))
    await panel.findByText(/^OVERLOAD aplicado en ND04821A07-T1/)
    expect(runs).toEqual([{ action: 'OVERLOAD', target: 'ND04821A07-T1' }])
  })

  it('disables every action while one is sent', async () => {
    let answer: () => void = () => undefined
    server.use(
      http.post(SCENARIOS, async ({ request }) => {
        const body = (await request.json()) as RunScenarioRequestDto
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json(scenarioResultFixture(body), { status: 201 })
      })
    )
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    await user.click(panel.getByRole('button', { name: 'Cortar tensión' }))

    expect(panel.getByRole('button', { name: 'Cortar tensión' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    expect(panel.getByRole('button', { name: 'Quitar fase' })).toBeDisabled()
    answer()
    expect(await panel.findByText(/^Tensión cortada en ND04821A07-A-R/)).toBeInTheDocument()
    expect(panel.getByRole('button', { name: 'Quitar fase' })).toBeEnabled()
  })

  it.each([
    [409, 'No cambió nada: ND04821A07-A-R ya está en ese estado.'],
    [404, 'No se encontró ND04821A07-A-R o está fuera de tu alcance.'],
    [400, 'El equipo no acepta esta acción. Revisa el fusible o la fase.'],
    [500, 'No se pudo lanzar el escenario. Intenta de nuevo.'],
  ])('explains an answer %i (AC7)', async (status, message) => {
    server.use(http.post(SCENARIOS, () => HttpResponse.json({ title: 'Error' }, { status })))
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    await user.click(panel.getByRole('button', { name: 'Abrir fusible' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(message)
  })

  it('explains a lost connection (AC7)', async () => {
    server.use(http.post(SCENARIOS, () => HttpResponse.error()))
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    await user.click(panel.getByRole('button', { name: 'Cerrar fusible' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'No se pudo lanzar el escenario. Intenta de nuevo.'
    )
  })

  it('asks for the scenarios again after a 403, and disappears when demo mode was turned off (AC7)', async () => {
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()
    server.use(
      http.post(SCENARIOS, () => HttpResponse.json({ title: 'Forbidden' }, { status: 403 }))
    )
    const requests = scenariosAnswer({ enabled: false, actions: [] })

    await user.click(panel.getByRole('button', { name: 'Abrir fusible' }))

    await waitFor(() => expect(requests.count).toBe(1))
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument())
  })

  it('says so when no fuse has a Falcon and no transformer has a SMAC', async () => {
    renderPanel({
      ...EXAMPLE,
      fuseSets: EXAMPLE.fuseSets.map((set) => ({
        ...set,
        fuses: set.fuses.map((item) => ({ ...item, deviceId: null })),
      })),
      transformers: EXAMPLE.transformers.map((item) => ({ ...item, deviceId: null })),
    })
    const panel = await findPanel()

    expect(
      panel.getByText('Este nodo no tiene equipos para simular escenarios.')
    ).toBeInTheDocument()
    expect(panel.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists a new backend action under its code, and leaves out one on another target (AC8)', async () => {
    scenariosAnswer({
      enabled: true,
      actions: [
        {
          action: 'LOW_ENERGY',
          target: 'FUSE',
          channel_required: false,
          effect: 'Supercap below 10 %',
        },
        { action: 'SILENCE', target: 'DEVICE', channel_required: false, effect: 'Gray node' },
      ],
    })
    recordRuns()
    const user = userEvent.setup()
    renderPanel()
    const panel = await findPanel()

    const lowEnergy = panel.getByRole('button', { name: 'LOW_ENERGY' })
    expect(lowEnergy).toHaveAttribute('title', 'Supercap below 10 %')
    expect(panel.queryByRole('button', { name: 'SILENCE' })).not.toBeInTheDocument()
    expect(
      panel.queryByRole('region', { name: 'Escenarios del transformador' })
    ).not.toBeInTheDocument()
    await user.click(lowEnergy)
    expect(await panel.findByRole('status')).toHaveTextContent(
      /^LOW_ENERGY aplicado en ND04821A07-A-R/
    )
  })

  it('is written in English when the language is English', async () => {
    await i18n.changeLanguage('en')
    renderPanel()

    const panel = within(await screen.findByRole('region', { name: 'Demo scenarios' }))
    expect(panel.getByRole('button', { name: 'Open fuse' })).toBeInTheDocument()
    expect(optionsOf(panel.getByRole('combobox', { name: 'Phase' }))[0]).toBe('Phase A · 127.1 V')
  })
})
