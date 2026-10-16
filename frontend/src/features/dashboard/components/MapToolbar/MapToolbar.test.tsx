/** Unit tests for the MapToolbar organism. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { DEFAULT_FILTERS } from '../../hooks/useLiveMonitoringFilters'
import { MapToolbar } from './MapToolbar'

const SCOPE = { zones: ['Z-01'], substations: ['SE-Norte', 'SE-Sur'], circuits: ['CR-12'] }

function renderToolbar() {
  const onToggleLayer = vi.fn()
  const onChange = vi.fn()
  render(
    <MapToolbar
      filters={DEFAULT_FILTERS}
      scope={SCOPE}
      onToggleLayer={onToggleLayer}
      onChange={onChange}
    />
  )
  return { onToggleLayer, onChange }
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

  it('offers "all" plus every scope value and reports the selection', async () => {
    const { onChange } = renderToolbar()
    const substation = screen.getByRole('combobox', { name: 'Subestación' })

    await userEvent.selectOptions(substation, 'SE-Sur')

    expect(within(substation).getAllByRole('option')).toHaveLength(3)
    expect(onChange).toHaveBeenCalledWith({ substation: 'SE-Sur' })
  })

  it('reports the zone, circuit and search filters', async () => {
    const { onChange } = renderToolbar()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Z-01')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Circuito' }), 'CR-12')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nodo' }), 'N')

    expect(onChange).toHaveBeenCalledWith({ zone: 'Z-01' })
    expect(onChange).toHaveBeenCalledWith({ circuit: 'CR-12' })
    expect(onChange).toHaveBeenCalledWith({ search: 'N' })
  })

  it('shows only the "all" option when there is no scope data yet', () => {
    render(
      <MapToolbar
        filters={DEFAULT_FILTERS}
        scope={{ zones: [], substations: [], circuits: [] }}
        onToggleLayer={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(
      within(screen.getByRole('combobox', { name: 'Zona' })).getAllByRole('option')
    ).toHaveLength(1)
  })
})
