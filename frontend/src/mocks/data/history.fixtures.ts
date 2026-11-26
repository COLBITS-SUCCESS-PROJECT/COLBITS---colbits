/**
 * Fault history of the mock service (GET /faults/history, PROVISIONAL contract of US20). Every node of
 * nodes.fixtures.ts gets a fixed, repeatable set of faults per calendar day, so tests can compute the
 * expected totals with `historyEventsOf`. Fuse faults are already grouped into one event per fuse set
 * (F-48 to F-50): three phases opening within 3 minutes count as one TRIPHASIC fault.
 */
import type { PhaseClassification } from '@/features/analysis/model/history.types'

export interface HistoryEventFixture {
  node: string
  /** Calendar day the fault started, YYYY-MM-DD. */
  day: string
  type: 'FUSE_OPENING' | 'NO_VOLTAGE'
  /** Only for fuse openings. */
  classification: PhaseClassification | null
}

const CLASSIFICATIONS: PhaseClassification[] = [
  'MONOPHASIC',
  'MONOPHASIC',
  'MONOPHASIC',
  'BIPHASIC',
  'BIPHASIC',
  'TRIPHASIC',
]
/** Out of 100: chance that a node has a fuse fault / a voltage alarm on a given day. */
const FUSE_CHANCE = 30
const VOLTAGE_CHANCE = 22
const HASH_RANGE = 100
const HASH_PRIME = 2_654_435_761
const SEED_PRIME = 31

/** A stable number per node, so each node fails on its own days. */
function seedOf(node: string): number {
  return [...node].reduce((sum, char) => Math.imul(sum, SEED_PRIME) + char.charCodeAt(0), 0)
}

/** Repeatable pseudo-random number in [0, 100) for one node, day and salt. */
function hash(seed: number, day: number, salt: number): number {
  const mixed = Math.imul(seed ^ (day + salt), HASH_PRIME) >>> 0
  return (mixed >>> 8) % HASH_RANGE
}

/** Days since 1970-01-01 of a YYYY-MM-DD date (UTC, so no time-zone shift). */
export function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

/** The faults that started on `day` at `node`. */
export function historyEventsOf(node: string, day: string): HistoryEventFixture[] {
  const seed = seedOf(node)
  const dayNo = dayNumber(day)
  const events: HistoryEventFixture[] = []
  if (hash(seed, dayNo, 1) < FUSE_CHANCE) {
    const index = hash(seed, dayNo, 2) % CLASSIFICATIONS.length
    const classification = CLASSIFICATIONS[index] as PhaseClassification
    events.push({ node, day, type: 'FUSE_OPENING', classification })
  }
  if (hash(seed, dayNo, 3) < VOLTAGE_CHANCE) {
    events.push({ node, day, type: 'NO_VOLTAGE', classification: null })
  }
  return events
}
