/** ScenarioActionGroup — its pickers, one button per action, and the disabled and busy states. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScenarioActionGroup, type ScenarioActionGroupProps } from './ScenarioActionGroup'

function renderGroup(overrides: Partial<ScenarioActionGroupProps> = {}) {
  const props: ScenarioActionGroupProps = {
    title: 'Transformer · SMAC',
    icon: 'transformer',
    target: {
      label: 'Transformer',
      options: [
        { value: 'N1-T1-3', label: 'N1-T1-3' },
        { value: 'N1-T2-3', label: 'N1-T2-3' },
      ],
      value: 'N1-T1-3',
      onChange: vi.fn(),
    },
    channel: {
      label: 'Phase',
      options: [
        { value: 'A', label: 'Phase A' },
        { value: 'B', label: 'Phase B' },
      ],
      value: 'A',
      onChange: vi.fn(),
    },
    actions: [
      { code: 'DROP_PHASE', label: 'Drop phase', isDisabled: false, onRun: vi.fn() },
      {
        code: 'NEW_ACTION',
        label: 'NEW_ACTION',
        hint: 'What it does',
        isDisabled: true,
        onRun: vi.fn(),
      },
    ],
    runningAction: null,
    ...overrides,
  }
  render(<ScenarioActionGroup {...props} />)
  return { props, group: within(screen.getByRole('region', { name: props.title })) }
}

describe('ScenarioActionGroup', () => {
  it('renders its pickers and one button per action', () => {
    const { group } = renderGroup()

    expect(group.getByRole('combobox', { name: 'Transformer' })).toHaveValue('N1-T1-3')
    expect(group.getByRole('combobox', { name: 'Phase' })).toHaveValue('A')
    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Drop phase',
      'NEW_ACTION',
    ])
  })

  it('runs an action when its button is pressed and reports each new choice', async () => {
    const user = userEvent.setup()
    const { props, group } = renderGroup()

    await user.click(group.getByRole('button', { name: 'Drop phase' }))
    await user.selectOptions(group.getByRole('combobox', { name: 'Transformer' }), 'N1-T2-3')
    await user.selectOptions(group.getByRole('combobox', { name: 'Phase' }), 'B')

    expect(props.actions[0]?.onRun).toHaveBeenCalledOnce()
    expect(props.target.onChange).toHaveBeenCalledWith('N1-T2-3')
    expect(props.channel?.onChange).toHaveBeenCalledWith('B')
  })

  it('disables an action that cannot run, and shows the hint of an action without a label', () => {
    const { group } = renderGroup()

    const unnamed = group.getByRole('button', { name: 'NEW_ACTION' })
    expect(unnamed).toBeDisabled()
    expect(unnamed).toHaveAttribute('title', 'What it does')
    expect(group.getByRole('button', { name: 'Drop phase' })).not.toHaveAttribute('title')
  })

  it('waits while an action is sent: that button spins and every control is disabled', () => {
    const { group } = renderGroup({ runningAction: 'DROP_PHASE' })

    expect(group.getByRole('button', { name: 'Drop phase' })).toHaveAttribute('aria-busy', 'true')
    for (const control of [...group.getAllByRole('button'), ...group.getAllByRole('combobox')]) {
      expect(control).toBeDisabled()
    }
  })

  it('has no phase picker when its actions need none, and disables a picker with no options', () => {
    const { group } = renderGroup({
      channel: undefined,
      target: { label: 'Transformer', options: [], value: '', onChange: vi.fn() },
    })

    expect(group.queryByRole('combobox', { name: 'Phase' })).not.toBeInTheDocument()
    expect(group.getByRole('combobox', { name: 'Transformer' })).toBeDisabled()
  })
})
