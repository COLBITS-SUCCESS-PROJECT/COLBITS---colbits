/** Entry point — mounts the React application. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import { App } from '@/app/App'
import { ENV } from '@/config/env'
import { startDevSession } from '@/mocks/devSession'

/** Starts the mock API (MSW) when enabled. Loaded on demand so it never ships in the production bundle. */
async function startMockApi(): Promise<void> {
  if (!ENV.ENABLE_MSW) return
  try {
    const { worker } = await import('@/mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  } catch {
    // The browser blocked the service worker (private mode, embedded browsers…). The app still
    // starts: requests go to VITE_API_BASE_URL and each screen shows its own error state.
  }
}

// Dev only (VITE_DEV_MOCK_SESSION): signs in a fake user so the app works without the backend.
// Set it to false to go through the login page (SCRUM-61).
if (ENV.DEV_MOCK_SESSION) startDevSession()

const root = document.getElementById('root')
if (!root) throw new Error('[COLBITS] Could not find #root element in HTML')

void startMockApi().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
