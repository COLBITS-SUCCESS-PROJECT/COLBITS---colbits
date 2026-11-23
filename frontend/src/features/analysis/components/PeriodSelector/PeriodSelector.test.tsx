/** Unit — PeriodSelector: preset chips, custom date fields and the range error (F-64). */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import type { PeriodPreset } from '../../model/history.types'
import type { RangeError } from '../../model/periodRange'
import { PeriodSelector } from './PeriodSelector'

function renderSelector(preset: PeriodPreset, rangeError: RangeError | null = null) {
  const onPresetChange = vi.fn()
  const onDateChange = vi.fn()
  render(
    <PeriodSelector
      preset={preset}
      customRange={{ from: '2026-09-01', to: '2026-09-27' }}
      rangeError={rangeError}
      maxDate="2026-11-19"
      onPresetChange={onPresetChange}
      onDateChange={onDateChange}
    />
  )
  return { onPresetChange, onDateChange }
}

describe('PeriodSelector', () => {
  it('shows the five chips with the active one pressed', () => {
    renderSelector('LAST_MONTH')

    const chips = screen.getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Última semana',
      'Último mes',
      'Últimos 6 meses',
      'Último año',
      'Rango personalizado',
    ])
    expect(screen.getByRole('button', { name: 'Último mes' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument()
  })

  it('reports the chosen preset', async () => {
    const { onPresetChange } = renderSelector('LAST_MONTH')

    await userEvent.click(screen.getByRole('button', { name: 'Último año' }))

    expect(onPresetChange).toHaveBeenCalledWith('LAST_YEAR')
  })

  it('shows the custom dates, limited to today, and reports a change', () => {
    const { onDateChange } = renderSelector('CUSTOM')

    const from = screen.getByLabelText('Desde')
    expect(from).toHaveValue('2026-09-01')
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('max', '2026-11-19')
    fireEvent.click(from)
    fireEvent.change(from, { target: { value: '2026-09-05' } })

    expect(onDateChange).toHaveBeenCalledWith('from', '2026-09-05')
  })

  it('explains an invalid range and marks both dates', () => {
    renderSelector('CUSTOM', 'FROM_AFTER_TO')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha de inicio debe ser anterior o igual a la de fin.'
    )
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Desde')).toHaveAccessibleDescription(
      'La fecha de inicio debe ser anterior o igual a la de fin.'
    )
  })

  it('opens the browser date picker when the field is clicked', () => {
    renderSelector('CUSTOM')
    const to = screen.getByLabelText('Hasta')
    const showPicker = vi.fn()
    Object.assign(to, { showPicker })

    fireEvent.click(to)

    expect(showPicker).toHaveBeenCalledOnce()
  })

  it('wraps the chips onto a new line when the screen is narrow', () => {
    renderSelector('CUSTOM')

    expect(screen.getByRole('group', { name: 'Periodo' })).toHaveClass('flex-wrap')
  })
})
