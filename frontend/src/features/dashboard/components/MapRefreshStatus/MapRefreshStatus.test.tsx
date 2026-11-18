/** Unit tests for MapRefreshStatus — last refresh time (F-32) and the warning when the map stops refreshing (F-31). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { applyLanguage } from '@/i18n'
import { DEFAULT_LANGUAGE } from '@/config/languages'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { MapRefreshStatus } from './MapRefreshStatus'

const LAST_REFRESH = new Date(2026, 10, 11, 9, 30, 5).getTime()
const WARNING = 'Actualización en vivo interrumpida: el mapa dejó de actualizarse.'

function renderStatus() {
  const onRetry = vi.fn()
  render(<MapRefreshStatus onRetry={onRetry} />)
  return { onRetry }
}

describe('MapRefreshStatus', () => {
  beforeEach(() => {
    useDataFreshnessStore.getState().reset()
    useDataFreshnessStore.getState().markSynced(LAST_REFRESH)
  })
  afterEach(() => {
    cleanup() // unmount first, so restoring the language does not re-render a mounted component
    applyLanguage(DEFAULT_LANGUAGE)
  })

  it('shows only the time while the map refreshes normally', () => {
    // Arrange & Act
    renderStatus()

    // Assert
    expect(screen.getByText('Última actualización: 09:30:05')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds the warning, under the time, when the refresh is interrupted', () => {
    useDataFreshnessStore.getState().setInterrupted(true)

    renderStatus()

    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(WARNING)
    expect(screen.getByText('Última actualización: 09:30:05')).toBeInTheDocument()
  })

  it('appears and goes away with the interruption, without reloading', () => {
    renderStatus()

    act(() => useDataFreshnessStore.getState().setInterrupted(true))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => useDataFreshnessStore.getState().setInterrupted(false))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks the map again from "Reintentar"', async () => {
    useDataFreshnessStore.getState().setInterrupted(true)
    const { onRetry } = renderStatus()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('follows the interface language', () => {
    useDataFreshnessStore.getState().setInterrupted(true)
    applyLanguage('en')

    renderStatus()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Live updates interrupted – the map is no longer refreshing.'
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('is centered from lg, where the time is in the top bar (Figma M10)', () => {
    useDataFreshnessStore.getState().setInterrupted(true)

    renderStatus()

    expect(screen.getByRole('alert')).toHaveClass('lg:self-center')
  })
})
