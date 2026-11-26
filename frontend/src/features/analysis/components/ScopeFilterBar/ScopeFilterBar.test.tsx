/** Unit — ScopeFilterBar: four selects starting with "All", reporting the level changed (F-65). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { EMPTY_SCOPE } from '../../model/history.constants'
import { ScopeFilterBar } from './ScopeFilterBar'

const OPTIONS = {
  zones: [{ value: '1', label: 'Zona Norte' }],
  substations: [{ value: '2', label: 'S/E NORTE 1' }],
  circuits: [{ value: '3', label: 'CTO 1' }],
  nodes: [{ value: 'ND1', label: 'ND1' }],
}

describe('ScopeFilterBar', () => {
  it('offers "All" first at every level', () => {
    render(<ScopeFilterBar scope={EMPTY_SCOPE} options={OPTIONS} onChange={vi.fn()} />)

    const firstOptions = ['Zona', 'Subestación', 'Circuito', 'Nodo'].map(
      (name) =>
        within(screen.getByRole('combobox', { name })).getAllByRole('option')[0]?.textContent
    )
    expect(firstOptions).toEqual([
      'Todas las zonas',
      'Todas las subestaciones',
      'Todos los circuitos',
      'Todos los nodos',
    ])
  })

  it('reports the level and value chosen', async () => {
    const onChange = vi.fn()
    render(<ScopeFilterBar scope={EMPTY_SCOPE} options={OPTIONS} onChange={onChange} />)

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Circuito' }), '3')

    expect(onChange).toHaveBeenCalledWith('circuit', '3')
  })

  it('stacks the selects in two columns on tablets instead of overflowing to the right', () => {
    render(<ScopeFilterBar scope={EMPTY_SCOPE} options={OPTIONS} onChange={vi.fn()} />)

    const grid = screen.getByRole('combobox', { name: 'Zona' }).closest('.grid')
    expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-4')
  })
})
