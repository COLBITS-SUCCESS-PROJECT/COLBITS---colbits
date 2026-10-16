/** Unit tests for the Tabs molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs, type TabItem } from './Tabs'
import { getTabPanelId } from './tabIds'

type FaultTab = 'active' | 'resolved' | 'inactive'

const ITEMS: TabItem<FaultTab>[] = [
  { id: 'active', label: 'Activas' },
  { id: 'resolved', label: 'Resueltas' },
  { id: 'inactive', label: 'Dispositivos inactivos' },
]

function renderTabs(activeId: FaultTab = 'active') {
  const onChange = vi.fn()
  render(
    <Tabs items={ITEMS} activeId={activeId} onChange={onChange} label="Fallas" idPrefix="faults" />
  )
  return onChange
}

describe('Tabs', () => {
  it('marks the active tab as selected', () => {
    // Arrange & Act
    renderTabs('resolved')

    // Assert
    expect(screen.getByRole('tab', { name: 'Resueltas' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Activas' })).toHaveAttribute('aria-selected', 'false')
  })

  it('requests a tab change on click', async () => {
    const onChange = renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: 'Resueltas' }))

    expect(onChange).toHaveBeenCalledWith('resolved')
  })

  it('moves to the next and previous tab with the arrow keys, wrapping around', async () => {
    const onChange = renderTabs()

    await userEvent.tab()
    await userEvent.keyboard('{ArrowLeft}')
    await userEvent.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenNthCalledWith(1, 'inactive')
    expect(onChange).toHaveBeenNthCalledWith(2, 'active')
    expect(screen.getByRole('tab', { name: 'Activas' })).toHaveFocus()
  })

  it('ignores other keys', async () => {
    const onChange = renderTabs()

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(onChange).not.toHaveBeenCalledWith('resolved')
  })

  it('points each tab to its panel', () => {
    renderTabs()

    expect(screen.getByRole('tab', { name: 'Activas' })).toHaveAttribute(
      'aria-controls',
      getTabPanelId('faults', 'active')
    )
  })

  it('renders an empty tab list when there are no items', () => {
    render(<Tabs items={[]} activeId="x" onChange={vi.fn()} label="Fallas" idPrefix="empty" />)

    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })
})
