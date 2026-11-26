/**
 * Fault indicators of the mock service (GET /faults/indicators · SCRUM-285, SCRUM-286). They come from the
 * same fuse faults as the history mock (history.fixtures.ts), so the cards of one period agree. Each fault
 * gets a repeatable start time and duration; about one in six lasts under a minute, so the
 * minimum-duration filter has something to remove.
 */
import type { PhaseClassification } from '@/features/analysis/model/history.types'
import { historyEventsOf } from './history.fixtures'

export interface IndicatorFaultFixture {
  node: string
  /** ISO instant. */
  startedAt: string
  durationSeconds: number
  classification: PhaseClassification | null
}

const SECONDS_PER_MINUTE = 60
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const HASH_RANGE = 100
const HASH_PRIME = 2_246_822_519
/** Out of 100: chance that a fault lasts under a minute. */
const SHORT_CHANCE = 17
/** Durations of the other faults, in whole minutes. */
const MIN_MINUTES = 2
const MAX_MINUTES = 240
/** The mock days are Bogotá days, like the backend's. */
const BOGOTA_OFFSET = '-05:00'

/** Repeatable pseudo-random number for one text and salt. */
function hashOf(text: string, salt: number): number {
  let value = salt
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), HASH_PRIME) >>> 0
  return value
}

const twoDigits = (value: number) => String(value).padStart(2, '0')

/** The fuse faults that started on `day` at `node`, with their start time and duration. */
export function indicatorFaultsOf(node: string, day: string): IndicatorFaultFixture[] {
  const key = `${node}:${day}`
  return historyEventsOf(node, day)
    .filter((event) => event.type === 'FUSE_OPENING')
    .map((event) => {
      const hour = twoDigits(hashOf(key, 1) % HOURS_PER_DAY)
      const minute = twoDigits(hashOf(key, 2) % MINUTES_PER_HOUR)
      const isShort = hashOf(key, 3) % HASH_RANGE < SHORT_CHANCE
      const minutes = MIN_MINUTES + (hashOf(key, 4) % (MAX_MINUTES - MIN_MINUTES + 1))
      return {
        node,
        startedAt: new Date(`${day}T${hour}:${minute}:00${BOGOTA_OFFSET}`).toISOString(),
        durationSeconds: isShort
          ? hashOf(key, 5) % SECONDS_PER_MINUTE
          : minutes * SECONDS_PER_MINUTE,
        classification: event.classification,
      }
    })
}
