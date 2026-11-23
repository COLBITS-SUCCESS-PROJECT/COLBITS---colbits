/** Unit — AnalysisRoutes renders the historical analysis view (US20). */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore } from '@/stores/auth.store'
import { AnalysisRoutes } from './index'

vi.mock('recharts', async (importOriginal) =>
  (await import('@/mocks/recharts.mock')).mockRecharts(importOriginal)
)

describe('AnalysisRoutes', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
  })
  afterAll(() => server.close())

  it('shows the period and scope selector', async () => {
    useAuthStore.getState().setSession({ id: 'u1', name: 'C', role: 'VIEWER' }, MOCK_TOKENS.DEV)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AnalysisRoutes />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByRole('region', { name: 'Periodo y alcance del análisis' })).toBeVisible()
    expect(await screen.findByRole('table', { name: 'Fallas por intervalo' })).toBeInTheDocument()
  })
})
