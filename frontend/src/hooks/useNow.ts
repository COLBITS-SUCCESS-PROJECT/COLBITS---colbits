/** useNow — current time (epoch ms) that refreshes on an interval, for time-dependent UI. */
import { useEffect, useState } from 'react'

export const DEFAULT_NOW_INTERVAL_MS = 30_000

export function useNow(intervalMs: number = DEFAULT_NOW_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
