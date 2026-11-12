/** Unit tests for the MapToolbar organism. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { DEFAULT_FILTERS } from '../../hooks/useLiveMonitoringFilters'
import type { FaultFilters } from '../../model/faultRules'
import { MapToolbar, type SearchResult } from './MapToolbar'

const SCOPE = {
  zones: [{ value: '1', label: 'Zona Norte' }],
  substations: [
    { value: '10', label: 'S/E Norte' },
    { value: '20', label: 'S/E Sur' },
  ],
  circuits: [{ value: '100', label: 'CTO 1' }],
}

function renderToolbar({
  filters = DEFAULT_FILTERS,
  searchResult = null,
}: { filters?: FaultFilters; searchResult?: SearchResult | null } = {}) {
  const onToggleLayer = vi.fn()
  const onChange = vi.fn()
  const onSearch = vi.fn()
  render(
    <MapToolbar
      filters={filters}
      scope={SCOPE}
      onToggleLayer={onToggleLayer}
      onChange={onChange}
      onSearch={onSearch}
      searchResult={searchResult}
    />
  )
  return { onToggleLayer, onChange, onSearch }
}

describe('MapToolbar', () => {
  it('shows both layer chips with the fuses layer on, like the Figma default', () => {
    // Arrange & Act
    renderToolbar()

    // Assert
    const layers = screen.getByRole('group', { name: 'Capas del mapa' })
    expect(within(layers).getByRole('button', { name: 'Fusibles · Falcon' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(within(layers).getByRole('button', { name: 'Transformadores · SMAC' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('requests a layer toggle', async () => {
    const { onToggleLayer } = renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Transformadores · SMAC' }))

    expect(onToggleLayer).toHaveBeenCalledWith('TRANSFORMERS')
  })

  it('opens and closes the location filters from the compact filter control', async () => {
    renderToolbar()
    const toggle = screen.getByRole('button', { name: 'Mostrar filtros de ubicación' })
    const filters = screen.getByRole('group', { name: 'Filtros de ubicación' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(filters).toHaveClass('hidden')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(filters).toHaveClass('grid')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar filtros de ubicación' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(filters).toHaveClass('hidden')
  })

  it('offers "all" plus every scope element by name and reports its id', async () => {
    const { onChange } = renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar filtros de ubicación' }))
    const substation = screen.getByRole('combobox', { name: 'Subestación' })

    await userEvent.selectOptions(substation, 'S/E Sur')

    expect(within(substation).getAllByRole('option')).toHaveLength(3)
    // A new substation restarts the circuit, which depends on it.
    expect(onChange).toHaveBeenCalledWith({ substation: '20', circuit: 'ALL' })
  })

  it('restarts substation and circuit when the zone changes, and reports the circuit', async () => {
    const { onChange } = renderToolbar()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Zona Norte')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Circuito' }), 'CTO 1')

    expect(onChange).toHaveBeenCalledWith({ zone: '1', substation: 'ALL', circuit: 'ALL' })
    expect(onChange).toHaveBeenCalledWith({ circuit: '100' })
  })

  it('reports what is typed and searches it on Enter (F-34)', async () => {
    const { onChange, onSearch } = renderToolbar({
      filters: { ...DEFAULT_FILTERS, search: '0000100002' },
    })
    const field = screen.getByRole('searchbox', { name: 'Buscar nodo o dispositivo' })

    await userEvent.type(field, 'N{Enter}')

    expect(onChange).toHaveBeenCalledWith({ search: '0000100002N' })
    expect(onSearch).toHaveBeenCalledWith('0000100002')
  })

  it('says where the map was centered, or that nothing matched', () => {
    const { unmount } = render(
      <MapToolbar
        filters={DEFAULT_FILTERS}
        scope={SCOPE}
        onToggleLayer={vi.fn()}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        searchResult={{ found: true, nodeId: '0000100002' }}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('Mapa centrado en el nodo 0000100002')
    unmount()

    renderToolbar({ searchResult: { found: false, query: 'XX' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'No hay ningún nodo ni dispositivo «XX» en tu alcance'
    )
  })

  it('shows only the "all" option when there is no scope data yet', () => {
    render(
      <MapToolbar
        filters={DEFAULT_FILTERS}
        scope={{ zones: [], substations: [], circuits: [] }}
        onToggleLayer={vi.fn()}
        onChange={vi.fn()}
        onSearch={vi.fn()}
        searchResult={null}
      />
    )

    expect(
      within(screen.getByRole('combobox', { name: 'Zona' })).getAllByRole('option')
    ).toHaveLength(1)
  })
})
