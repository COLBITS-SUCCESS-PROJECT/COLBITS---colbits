/** Tests for the FaultPanel organism (with FaultFilters and FaultList). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { DEFAULT_FILTERS } from '../../hooks/useLiveMonitoringFilters'
import { selectFaults, type FaultFilters } from '../../model/faultRules'
import { buildLiveMonitoringMock } from '../../model/liveMonitoring.mock'
import { FaultPanel, type FaultPanelProps } from './FaultPanel'

const NOW = Date.now()
const data = buildLiveMonitoringMock(NOW)
const ALL_LAYERS: FaultFilters = { ...DEFAULT_FILTERS, layers: ['FUSES', 'TRANSFORMERS'] }

function renderPanel(overrides: Partial<FaultPanelProps> = {}) {
  const props: FaultPanelProps = {
    tab: 'ACTIVE',
    onTabChange: vi.fn(),
    activeFaults: selectFaults(data.faults, ALL_LAYERS, 'OPEN', NOW),
    resolvedFaults: selectFaults(data.faults, ALL_LAYERS, 'RESOLVED', NOW),
    counters: data.counters,
    filters: DEFAULT_FILTERS,
    onFiltersChange: vi.fn(),
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <FaultPanel {...props} />
    </MemoryRouter>
  )
  return props
}

describe('FaultPanel', () => {
  it('shows the header, counters and the active faults sorted like the Figma panel', () => {
    // Arrange & Act
    renderPanel()

    // Assert
    const panel = screen.getByRole('complementary', { name: 'Gestión de fallas' })
    expect(within(panel).getByText('6 activas')).toBeInTheDocument()
    const counters = within(panel).getByRole('region', { name: 'Resumen de nodos con alarma' })
    expect(within(counters).getByText('7')).toBeInTheDocument()
    const cards = within(panel).getAllByRole('article')
    expect(cards[0]).toHaveAccessibleName('Apertura de fusible · ND04821A07')
    expect(within(panel).getByRole('link', { name: /Alarmas anteriores/ })).toHaveAttribute(
      'href',
      '/analysis'
    )
  })

  it('requests a tab change and shows the resolved list', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: 'Resueltas' }))
    expect(props.onTabChange).toHaveBeenCalledWith('RESOLVED')
  })

  it('renders the resolved faults on the resolved tab', () => {
    renderPanel({ tab: 'RESOLVED' })

    expect(screen.getByRole('heading', { name: 'Fallas resueltas' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('shows the placeholder on the inactive devices tab', () => {
    renderPanel({ tab: 'INACTIVE' })

    expect(screen.getByText(/dispositivos inactivos llegará/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('reports every filter change', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Última hora' }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de alerta' }),
      'NO_VOLTAGE'
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Clasificación' }),
      'TRIPHASIC'
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Duración mínima ≥ 5 min' }))

    expect(props.onFiltersChange).toHaveBeenCalledWith({ timeWindow: 'LAST_HOUR' })
    expect(props.onFiltersChange).toHaveBeenCalledWith({ alertType: 'NO_VOLTAGE' })
    expect(props.onFiltersChange).toHaveBeenCalledWith({ classification: 'TRIPHASIC' })
    expect(props.onFiltersChange).toHaveBeenCalledWith({ onlyLongFaults: true })
  })

  it('explains the minimum-duration filter in a tooltip', () => {
    renderPanel()

    expect(
      screen.getByRole('button', { name: 'Qué hace el filtro de duración mínima' })
    ).toHaveAccessibleDescription(/se ocultan las fallas más cortas/)
  })

  it('shows skeletons while loading and hides the counters without data', () => {
    renderPanel({ isLoading: true, counters: null })

    expect(screen.getByLabelText('Cargando fallas')).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.queryByRole('region', { name: 'Resumen de nodos con alarma' })
    ).not.toBeInTheDocument()
  })

  it('shows the error state with a retry action', async () => {
    const props = renderPanel({ isError: true })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las fallas.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when no fault matches', () => {
    renderPanel({ activeFaults: [] })

    expect(screen.getByText('No hay fallas que coincidan con los filtros.')).toBeInTheDocument()
    expect(screen.getByText('0 activas')).toBeInTheDocument()
  })
})
