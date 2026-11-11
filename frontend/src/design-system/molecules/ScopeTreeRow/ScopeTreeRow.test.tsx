/** Unit tests for the ScopeTreeRow molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScopeTreeRow, type ScopeTreeRowProps } from './ScopeTreeRow'

function renderRow(props: Partial<ScopeTreeRowProps> = {}) {
  const onToggle = vi.fn()
  const view = render(
    <ScopeTreeRow
      label="Subestación SE-Norte"
      icon="building"
      level={1}
      isChecked={false}
      meta="18 dispositivos"
      onToggle={onToggle}
      {...props}
    />
  )
  return { onToggle, ...view }
}

describe('ScopeTreeRow', () => {
  it('names the checkbox with the label and shows the meta text apart', () => {
    // Arrange & Act
    renderRow()

    // Assert
    expect(screen.getByRole('checkbox', { name: 'Subestación SE-Norte' })).not.toBeChecked()
    expect(screen.getByText('18 dispositivos')).toBeInTheDocument()
  })

  it('reports the new value when the label is clicked', async () => {
    const { onToggle } = renderRow()

    await userEvent.click(screen.getByText('Subestación SE-Norte'))

    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('reports false when a checked row is unticked', async () => {
    const { onToggle } = renderRow({ isChecked: true })

    await userEvent.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('highlights checked and partial rows only', () => {
    const { container, rerender } = renderRow({ isChecked: true })
    const row = () => container.firstElementChild
    expect(row()).toHaveClass('bg-feedback-info-bg')

    rerender(
      <ScopeTreeRow
        label="x"
        icon="map"
        level={0}
        isChecked={false}
        isIndeterminate
        onToggle={vi.fn()}
      />
    )
    expect(row()).toHaveClass('bg-feedback-info-bg')
    expect((screen.getByRole('checkbox') as HTMLInputElement).indeterminate).toBe(true)

    rerender(<ScopeTreeRow label="x" icon="map" level={0} isChecked={false} onToggle={vi.fn()} />)
    expect(row()).not.toHaveClass('bg-feedback-info-bg')
  })

  it('indents the row by its level', () => {
    const { container } = renderRow({ level: 3 })

    expect(container.firstElementChild).toHaveAttribute('data-level', '3')
    expect(container.firstElementChild).toHaveClass('pl-22')
  })
})
