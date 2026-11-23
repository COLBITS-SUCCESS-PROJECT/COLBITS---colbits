/** Unit — ChartCard: the chart when ready, and its loading / empty / error states. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { ChartCard, type ChartCardStatus } from './ChartCard'

function renderCard(status: ChartCardStatus, onRetry = vi.fn()) {
  render(
    <ChartCard title="Tendencia" subtitle="Por día" status={status} onRetry={onRetry}>
      <p>chart</p>
    </ChartCard>
  )
  return onRetry
}

describe('ChartCard', () => {
  it('shows the title, subtitle and chart when ready', () => {
    renderCard('ready')

    const card = screen.getByRole('region', { name: 'Tendencia' })
    expect(card).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('heading', { name: 'Tendencia' })).toBeInTheDocument()
    expect(screen.getByText('Por día')).toBeInTheDocument()
    expect(screen.getByText('chart')).toBeInTheDocument()
  })

  it('announces loading without the chart', () => {
    renderCard('loading')

    expect(screen.getByRole('region', { name: 'Tendencia' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Cargando historial…')).toBeInTheDocument()
    expect(screen.queryByText('chart')).not.toBeInTheDocument()
  })

  it('says there are no faults when empty', () => {
    renderCard('empty')

    expect(screen.getByText('No hay fallas registradas en este periodo y alcance.')).toBeVisible()
  })

  it('shows the error with a retry button', async () => {
    const onRetry = renderCard('error')

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el historial.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('contains its screen-reader-only content, so the page itself never scrolls (sidebar stays fixed)', () => {
    renderCard('ready')

    // An sr-only element is absolutely positioned: without a positioned card it grows the document.
    expect(screen.getByRole('region', { name: 'Tendencia' })).toHaveClass('relative')
  })
})
