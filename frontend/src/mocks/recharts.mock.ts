/**
 * Recharts for tests: jsdom has no layout, so ResponsiveContainer would measure 0 px and update its
 * size after mounting (an act() warning). This one draws its chart at a fixed size right away.
 * Use: vi.mock('recharts', mockRecharts)
 */
import { cloneElement, createElement, isValidElement, type ReactNode } from 'react'

const TEST_WIDTH = 500
const TEST_HEIGHT = 200

function ResponsiveContainer({ children }: { children: ReactNode }) {
  const chart = isValidElement<{ width?: number; height?: number }>(children)
    ? cloneElement(children, { width: TEST_WIDTH, height: TEST_HEIGHT })
    : children
  return createElement('div', null, chart)
}

/** vi.mock factory: the real Recharts with a fixed-size ResponsiveContainer. */
export async function mockRecharts(importOriginal: () => Promise<object>) {
  return { ...(await importOriginal()), ResponsiveContainer }
}
