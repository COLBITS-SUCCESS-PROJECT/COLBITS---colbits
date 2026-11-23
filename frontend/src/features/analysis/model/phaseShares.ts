/** Share of each phase classification in the distribution chart (F-67). */
import { PERCENT, PHASE_CLASSIFICATIONS } from './history.constants'
import type { PhaseClassification } from './history.types'

/** Whole-number shares; the last non-empty class takes the rounding rest so they add up to 100. */
export function phaseShares(
  distribution: Record<PhaseClassification, number>
): Record<PhaseClassification, number> {
  const total = PHASE_CLASSIFICATIONS.reduce((sum, key) => sum + distribution[key], 0)
  const shares = { MONOPHASIC: 0, BIPHASIC: 0, TRIPHASIC: 0 }
  if (total === 0) return shares
  for (const key of PHASE_CLASSIFICATIONS) {
    shares[key] = Math.round((distribution[key] / total) * PERCENT)
  }
  const last = [...PHASE_CLASSIFICATIONS].reverse().find((key) => distribution[key] > 0)
  const rest = PERCENT - PHASE_CLASSIFICATIONS.reduce((sum, key) => sum + shares[key], 0)
  if (last) shares[last] += rest
  return shares
}
