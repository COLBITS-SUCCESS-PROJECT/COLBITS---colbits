/**
 * Open faults of the mock fault service (GET /faults), shaped like backend/src/faults/dto/faults.dto.ts.
 * They sit on nodes whose fuse layer is red in nodes.fixtures.ts. Times are relative to `now`.
 */
import type { ActiveFaultDto } from '@/features/dashboard/api/faults.dto'

const MS_PER_MINUTE = 60_000
const SECONDS_PER_MINUTE = 60
const TWO_DAYS_IN_MINUTES = 2 * 24 * 60

type FaultSeed = Pick<
  ActiveFaultDto,
  'node' | 'circuit' | 'fuses_set_id' | 'branch' | 'phases' | 'classification' | 'client_count'
> & { minutesOpen: number }

const FAULT_SEEDS: FaultSeed[] = [
  // F-51 / F-55 acceptance example: a two-phase fault on branch B, on a fuse set with 80 clients.
  {
    node: 'ND04821A07',
    circuit: { id: 12, name: 'CR-12' },
    fuses_set_id: 12,
    branch: 'B',
    phases: ['R', 'S'],
    classification: 'BIPHASIC',
    client_count: 80,
    minutesOpen: 52,
  },
  // Same node, other fuse set (F-50): open for two days, with no client count recorded.
  {
    node: 'ND04821A07',
    circuit: { id: 12, name: 'CR-12' },
    fuses_set_id: 11,
    branch: 'A',
    phases: ['T'],
    classification: 'MONOPHASIC',
    client_count: null,
    minutesOpen: TWO_DAYS_IN_MINUTES,
  },
  // Outside the north user's scope (F-10).
  {
    node: 'ND05510C11',
    circuit: { id: 7, name: 'CR-07' },
    fuses_set_id: 7,
    branch: null,
    phases: ['R', 'S', 'T'],
    classification: 'TRIPHASIC',
    client_count: 142,
    minutesOpen: 123,
  },
]

export function activeFaultFixtures(now: number): ActiveFaultDto[] {
  return FAULT_SEEDS.map(({ minutesOpen, ...seed }) => {
    const startedAt = new Date(now - minutesOpen * MS_PER_MINUTE).toISOString()
    return {
      ...seed,
      id: `${seed.fuses_set_id}:${startedAt}`,
      alert_type: 'FUSE_OPENING',
      state: 'OPEN',
      started_at: startedAt,
      ended_at: null,
      duration_seconds: minutesOpen * SECONDS_PER_MINUTE,
      openings: (seed.phases ?? []).map((phase) => ({
        fuse_id: `${seed.node}-${seed.branch ?? 'A'}-${phase}`,
        phase,
        opened_at: startedAt,
        closed_at: null,
      })),
      warnings: [],
    }
  })
}
