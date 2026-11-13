/**
 * Shared steps of the map refresh acceptance tests (SCRUM-111 · F-31, F-32). Time is simulated, so the
 * 15 s between refreshes pass without waiting, and a service can stop answering as the real API does
 * when it is cut.
 */
import { act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
import { server } from './server'

/** Simulated time advances in steps of this size, so each request is answered before the next step. */
export const STEP_MS = 1_000

/** Fake clock that still moves on its own, so the mocked services keep answering. */
export function startSimulatedTime() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    shouldAdvanceTime: true,
  })
}

/** From now on the service cannot be reached (network error), as when the API is cut. Counts the attempts. */
export function cutService(endpoint: string) {
  const attempts = { count: 0 }
  server.use(
    http.get(`*${endpoint}`, () => {
      attempts.count += 1
      return HttpResponse.error()
    })
  )
  return attempts
}

/** Lets `ms` of simulated time pass, one step at a time. */
export async function letTimePass(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEP_MS)
    })
  }
}
