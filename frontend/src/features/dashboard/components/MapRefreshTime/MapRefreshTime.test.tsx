/** Unit tests for the MapRefreshTime molecule (F-32). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { applyLanguage } from '@/i18n'
import { DEFAULT_LANGUAGE } from '@/config/languages'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { LIVE_REFETCH_INTERVAL_MS } from '../../model/liveMonitoring.constants'
import { MapRefreshTime } from './MapRefreshTime'

const LAST_REFRESH = new Date(2026, 10, 3, 21, 4, 12).getTime()

describe('MapRefreshTime', () => {
  beforeEach(() => useDataFreshnessStore.getState().reset())
  afterEach(() => {
    cleanup() // unmount first, so restoring the language does not re-render a mounted component
    applyLanguage(DEFAULT_LANGUAGE)
  })

  it('shows the time of the last successful refresh, with seconds', () => {
    // Arrange
    useDataFreshnessStore.getState().markSynced(LAST_REFRESH)

    // Act
    render(<MapRefreshTime />)

    // Assert
    expect(screen.getByText('Última actualización: 21:04:12')).toBeInTheDocument()
  })

  it('shows nothing before the first successful refresh', () => {
    const { container } = render(<MapRefreshTime />)

    expect(container).toBeEmptyDOMElement()
  })

  it('moves on when a new refresh succeeds', () => {
    useDataFreshnessStore.getState().markSynced(LAST_REFRESH)
    render(<MapRefreshTime />)

    act(() => useDataFreshnessStore.getState().markSynced(LAST_REFRESH + LIVE_REFETCH_INTERVAL_MS))

    expect(screen.getByText('Última actualización: 21:04:27')).toBeInTheDocument()
  })

  it('follows the interface language', () => {
    useDataFreshnessStore.getState().markSynced(LAST_REFRESH)
    applyLanguage('en')

    render(<MapRefreshTime />)

    expect(screen.getByText('Last update: 21:04:12')).toBeInTheDocument()
  })

  it('is only shown below the lg breakpoint, where the top bar hides the time', () => {
    useDataFreshnessStore.getState().markSynced(LAST_REFRESH)

    render(<MapRefreshTime />)

    expect(screen.getByText(/21:04:12/)).toHaveClass('lg:hidden')
  })
})
