/** Unit tests for the ScopePicker organism (SCRUM-250 AC6). */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { SAMPLE_SCOPE_TREE } from '../../model/users.sampleData'
import type { ScopeItem } from '../../model/users.types'
import { ScopePicker } from './ScopePicker'

function Harness({ initial = [], onChange }: { initial?: ScopeItem[]; onChange?: () => void }) {
  const [value, setValue] = useState<ScopeItem[]>(initial)
  return (
    <ScopePicker
      tree={SAMPLE_SCOPE_TREE}
      value={value}
      onChange={(scope) => {
        setValue(scope)
        onChange?.()
      }}
    />
  )
}

const selectedList = () => screen.getByRole('heading', { name: /Alcance seleccionado/ })

describe('ScopePicker', () => {
  it('starts with the zones closed and nothing selected', () => {
    // Arrange & Act
    render(<Harness />)

    // Assert
    expect(screen.getByRole('checkbox', { name: 'Zona Z-01 · Distrito Norte' })).not.toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByText('1 dispositivo')).toBeInTheDocument()
    expect(selectedList()).toHaveTextContent('Alcance seleccionado (0)')
    expect(screen.getByText('Todavía no has seleccionado ningún elemento.')).toBeInTheDocument()
  })

  it('opens a zone and selects a substation, leaving the zone partial', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contenido de Zona Z-01' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Subestación SE-Sur' }))

    const zone = screen.getByRole('checkbox', { name: 'Zona Z-01 · Distrito Norte' })
    expect((zone as HTMLInputElement).indeterminate).toBe(true)
    expect(selectedList()).toHaveTextContent('(1)')
    expect(screen.getByRole('listitem')).toHaveTextContent('Subestación SE-Sur')
  })

  it('locks what is under a selected element', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Zona Z-02 · Distrito Oriente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contenido de Zona Z-02' }))

    const substation = screen.getByRole('checkbox', { name: 'Subestación SE-Oriente' })
    expect(substation).toBeChecked()
    expect(substation).toBeDisabled()
  })

  it('opens the path to an existing scope', () => {
    render(<Harness initial={[{ id: 'CIRCUIT:CR-12', level: 'CIRCUIT', name: 'CR-12' }]} />)

    expect(screen.getByRole('checkbox', { name: 'Circuito CR-12' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Ocultar contenido de Zona Z-01' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('finds elements at any level by search', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en la red' }), 'fal-00877')

    const group = screen.getByRole('group', { name: 'Alcance de datos' })
    // The device and the zone › substation › circuit › node path that leads to it.
    expect(within(group).getAllByRole('checkbox')).toHaveLength(5)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dispositivo FAL-00877' }))
    expect(selectedList()).toHaveTextContent('(1)')
  })

  it('says so when the search matches nothing', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByRole('searchbox'), 'zzz')

    expect(screen.getByText('Ningún elemento coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('shows the validation message linked to the tree', () => {
    render(
      <ScopePicker tree={SAMPLE_SCOPE_TREE} value={[]} onChange={vi.fn()} error="Falta alcance" />
    )

    expect(screen.getByRole('group')).toHaveAccessibleDescription('Falta alcance')
  })
})
