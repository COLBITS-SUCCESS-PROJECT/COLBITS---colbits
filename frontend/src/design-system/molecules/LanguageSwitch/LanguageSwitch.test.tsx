/** Tests for the LanguageSwitch molecule (SCRUM-158 AC1, AC6). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageSwitch, type LanguageSwitchOption } from './LanguageSwitch'

type Code = 'es' | 'en'

const OPTIONS: LanguageSwitchOption<Code>[] = [
  { value: 'es', label: 'ES', name: 'Español' },
  { value: 'en', label: 'EN', name: 'English' },
]

function renderSwitch(value: Code = 'es') {
  const onChange = vi.fn()
  render(<LanguageSwitch options={OPTIONS} value={value} onChange={onChange} label="Idioma" />)
  return { onChange }
}

describe('LanguageSwitch', () => {
  it('is one button that shows every language and marks the active one', () => {
    renderSwitch('es')

    const button = screen.getByRole('button', { name: 'Idioma: Español. English' })
    expect(button).toHaveTextContent('ESEN')
    expect(screen.getByText('ES')).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('EN')).toHaveAttribute('data-active', 'false')
  })

  it.each([
    ['ES', 'es', 'en'],
    ['EN', 'es', 'en'],
    ['ES', 'en', 'es'],
  ] as const)(
    'a click anywhere (on %s) moves from %s to the other language',
    async (target, value, expected) => {
      const { onChange } = renderSwitch(value)

      await userEvent.click(screen.getByText(target))

      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange).toHaveBeenCalledWith(expected)
    }
  )

  it('works with the keyboard (Tab, then Enter or Space)', async () => {
    const { onChange } = renderSwitch('es')

    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith('en')
  })

  it('tells which language a click switches to', () => {
    renderSwitch('en')

    expect(screen.getByRole('button')).toHaveAttribute('title', 'Español')
  })
})
