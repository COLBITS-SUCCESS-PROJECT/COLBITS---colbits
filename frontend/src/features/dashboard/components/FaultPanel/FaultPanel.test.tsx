/** Tests for the FaultPanel organism (with FaultFilters and FaultList). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { DEFAULT_FILTERS } from '../../hooks/useLiveMonitoringFilters'
import { selectFaults, type FaultFilters } from '../../model/faultRules'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import { buildInactiveDevicesMock } from '@/mocks/data/inactiveDevices.fixtures'
import { DEFAULT_INACTIVE_FILTERS as INACTIVE_FILTERS } from '../../hooks/useInactiveDevicesFilters'
import { deriveInactiveScope, selectInactiveDevices } from '../../model/inactiveDevices.rules'
import { FaultPanel, type FaultPanelProps } from './FaultPanel'
import type { InactiveDevicesTabProps } from './InactiveDevicesTab'

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
    expect(within(panel).getByText('7 activas')).toBeInTheDocument()
    const counters = within(panel).getByRole('region', { name: 'Resumen de nodos con alarma' })
    expect(within(counters).getByText('7')).toBeInTheDocument()
    const cards = within(panel).getAllByRole('article')
    expect(cards[0]).toHaveAccessibleName('Apertura de fusible · ND04821A07')
    expect(within(panel).getByRole('link', { name: /Alarmas anteriores/ })).toHaveAttribute(
      'href',
      '/analysis'
    )
  })

  it('widens the panel with the keyboard from its resize handle', async () => {
    renderPanel()
    const handle = screen.getByRole('separator', { name: 'Ajustar el ancho del panel de fallas' })
    const panel = screen.getByRole('complementary', { name: 'Gestión de fallas' })

    expect(handle).toHaveAttribute('aria-valuenow', '360')
    handle.focus()
    await userEvent.keyboard('{ArrowLeft}')

    expect(handle).toHaveAttribute('aria-valuenow', '384')
    expect(panel.style.getPropertyValue('--fault-panel-width')).toBe('384px')
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

  it('shows the placeholder on the inactive devices tab while there is no data', () => {
    renderPanel({ tab: 'INACTIVE' })

    expect(screen.getByText(/dispositivos inactivos llegará/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  describe('inactive devices tab', () => {
    const views = selectInactiveDevices(buildInactiveDevicesMock(NOW), INACTIVE_FILTERS, NOW)
    const scope = deriveInactiveScope(buildInactiveDevicesMock(NOW), INACTIVE_FILTERS)

    function renderInactive(overrides: Partial<InactiveDevicesTabProps> = {}) {
      const inactive: InactiveDevicesTabProps = {
        devices: views,
        filters: INACTIVE_FILTERS,
        scope,
        onFiltersChange: vi.fn(),
        isLoading: false,
        isError: false,
        onRetry: vi.fn(),
        ...overrides,
      }
      renderPanel({ tab: 'INACTIVE', inactive })
      return inactive
    }

    it('lists the devices longest silence first and counts those silent now', () => {
      renderInactive()

      const cards = screen.getAllByRole('article')
      expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
        'ND03090C04 · Inactivo ahora',
        'ND08812B05 · Inactivo ahora',
        'ND07311A06 · Inactivo en el periodo',
        'ND02218B09 · Inactivo en el periodo',
      ])
      expect(screen.getByText('2 inactivos ahora')).toBeInTheDocument()
      expect(
        screen.getByText('4 dispositivos · último día · mayor silencio primero')
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Alarmas anteriores/ })).toHaveAttribute(
        'href',
        '/analysis'
      )
    })

    it('reports the time window and every location filter', async () => {
      const inactive = renderInactive()

      await userEvent.click(screen.getByRole('button', { name: 'Última hora' }))
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Sur')
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Subestación' }), 'SE-Sur')
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Circuito' }), 'CR-25')
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Nodo' }), 'ND03090C04')

      expect(inactive.onFiltersChange).toHaveBeenCalledWith({ timeWindow: 'LAST_HOUR' })
      expect(inactive.onFiltersChange).toHaveBeenCalledWith({ zone: 'Sur' })
      expect(inactive.onFiltersChange).toHaveBeenCalledWith({ substation: 'SE-Sur' })
      expect(inactive.onFiltersChange).toHaveBeenCalledWith({ circuit: 'CR-25' })
      expect(inactive.onFiltersChange).toHaveBeenCalledWith({ node: 'ND03090C04' })
    })

    it('shows the empty state when no device is inactive', () => {
      renderInactive({ devices: [] })

      expect(screen.getByText('No hay dispositivos inactivos en este periodo.')).toBeInTheDocument()
      expect(screen.getByText('0 inactivos ahora')).toBeInTheDocument()
    })

    it('shows skeletons while loading', () => {
      renderInactive({ isLoading: true, devices: [] })

      expect(screen.getByLabelText('Cargando dispositivos inactivos')).toHaveAttribute(
        'aria-busy',
        'true'
      )
    })

    it('shows the error state with a retry action', async () => {
      const inactive = renderInactive({ isError: true })

      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudieron cargar los dispositivos inactivos.'
      )
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(inactive.onRetry).toHaveBeenCalledTimes(1)
    })
  })

  it('shows a placeholder on the resolved tab while there are no resolved faults to show', () => {
    renderPanel({ tab: 'RESOLVED', resolvedFaults: null })

    expect(screen.getByText(/fallas resueltas llegará/)).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Resumen de nodos con alarma' })
    ).not.toBeInTheDocument()
  })

  it('reports a change of the last hour / last day selector', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Última hora' }))

    expect(props.onFiltersChange).toHaveBeenCalledWith({ timeWindow: 'LAST_HOUR' })
  })

  it('has no filter of its own apart from its tabs and the last hour / last day selector (F-56)', () => {
    // Arrange & Act
    renderPanel()

    // Assert: it follows the filter at the top of the map, so it offers no select or switch
    const panel = screen.getByRole('complementary', { name: 'Gestión de fallas' })
    expect(within(panel).queryAllByRole('combobox')).toHaveLength(0)
    expect(within(panel).queryAllByRole('switch')).toHaveLength(0)
    expect(within(panel).getAllByRole('tab')).toHaveLength(3)
    expect(within(panel).getByRole('group', { name: 'Mostrar' })).toBeInTheDocument()
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

  it('uses the singular for a single active fault', () => {
    renderPanel({ activeFaults: selectFaults(data.faults, ALL_LAYERS, 'OPEN', NOW).slice(0, 1) })

    expect(screen.getByText('1 activa')).toBeInTheDocument()
  })

  it('shows the empty state when no fault matches', () => {
    renderPanel({ activeFaults: [] })

    expect(screen.getByText('No hay fallas que coincidan con los filtros.')).toBeInTheDocument()
    expect(screen.getByText('0 activas')).toBeInTheDocument()
  })

  it('renders the mobile sheet as a closable dialog', async () => {
    const onClose = vi.fn()
    renderPanel({
      closeLabel: 'Cerrar panel de fallas',
      isMobileOpen: true,
      onClose,
    })

    const panel = screen.getByRole('dialog', { name: 'Gestión de fallas' })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(
      within(panel).getByRole('button', { name: 'Cerrar panel de fallas' })
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Cerrar panel de fallas' }))
    expect(onClose).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
