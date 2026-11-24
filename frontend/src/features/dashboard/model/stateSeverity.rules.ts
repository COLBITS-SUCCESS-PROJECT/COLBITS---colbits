/**
 * How severe each node state is, from most to least severe, in the order F-15 to F-22 rank the
 * conditions of a single node: red first, then yellow, then gray, and green only when nothing else
 * applies, because missing data must never look healthy. A cluster on the map takes the most severe
 * state of its nodes (requested by Colbits on 2026-11-20).
 */
import type { NetworkState } from './liveMonitoring.types'

export const STATES_BY_SEVERITY: readonly NetworkState[] = [
  'CRITICAL',
  'WARNING',
  'INACTIVE',
  'UNKNOWN',
  'NORMAL',
]

/** The most severe of `states`; UNKNOWN when there is none, since no data must not look healthy. */
export function mostSevereState(states: readonly NetworkState[]): NetworkState {
  return STATES_BY_SEVERITY.find((state) => states.includes(state)) ?? 'UNKNOWN'
}
