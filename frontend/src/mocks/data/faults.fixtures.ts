/**
 * Faults of the mock fault service, shaped like backend/src/faults/dto/faults.dto.ts. The open ones
 * (GET /faults) sit on nodes whose fuse layer is red in nodes.fixtures.ts; the resolved ones
 * (GET /faults/resolved) ended in the last hour or the last day. Times are relative to `now`.
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

/** A fuse opening that started `minutesAgo`; closed `endedMinutesAgo` when that is not null. */
function fuseOpening(
  seed: Omit<FaultSeed, 'minutesOpen'>,
  now: number,
  minutesAgo: number,
  endedMinutesAgo: number | null
): ActiveFaultDto {
  const startedAt = new Date(now - minutesAgo * MS_PER_MINUTE).toISOString()
  const endedAt =
    endedMinutesAgo === null ? null : new Date(now - endedMinutesAgo * MS_PER_MINUTE).toISOString()
  return {
    ...seed,
    id: `${seed.fuses_set_id}:${startedAt}`,
    alert_type: 'FUSE_OPENING',
    device: 'FALCON',
    source_id: null,
    channel: null,
    state: endedAt === null ? 'OPEN' : 'RESOLVED',
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: (minutesAgo - (endedMinutesAgo ?? 0)) * SECONDS_PER_MINUTE,
    openings: (seed.phases ?? []).map((phase) => ({
      fuse_id: `${seed.node}-${seed.branch ?? 'A'}-${phase}`,
      phase,
      opened_at: startedAt,
      closed_at: endedAt,
    })),
    warnings: [],
    conditions: null,
    transformer_load: null,
  }
}

export function activeFaultFixtures(now: number): ActiveFaultDto[] {
  return FAULT_SEEDS.map(({ minutesOpen, ...seed }) => fuseOpening(seed, now, minutesOpen, null))
}

const CTO_1 = { id: 1, name: 'CTO 1' }
const NO_PHASES = { phases: null, classification: null, client_count: null } as const

/**
 * Resolved faults and alarms, newest resolution first as GET /faults/resolved sends them (F-62):
 * in the north user's scope a fuse opening of 45 min that closed 20 min ago (F-63), a loss of voltage
 * that ended 40 min ago and a SMAC phase loss that ended 3 h ago (last day only); outside it, one
 * fuse opening that closed 10 min ago.
 */
export function resolvedFaultFixtures(now: number): ActiveFaultDto[] {
  const branchA = { circuit: CTO_1, fuses_set_id: 11, branch: 'A' }
  const voltage = fuseOpening(
    { node: 'ND01120A02', circuit: CTO_1, fuses_set_id: 21, branch: null, ...NO_PHASES },
    now,
    50,
    40
  )
  const phase = fuseOpening(
    { node: 'ND01120A02', circuit: CTO_1, fuses_set_id: null, branch: null, ...NO_PHASES },
    now,
    300,
    180
  )
  return [
    fuseOpening(
      {
        ...branchA,
        node: 'ND05510C11',
        phases: ['R'],
        classification: 'MONOPHASIC',
        client_count: 9,
      },
      now,
      25,
      10
    ),
    fuseOpening(
      {
        ...branchA,
        node: 'ND04821A07',
        phases: ['R'],
        classification: 'MONOPHASIC',
        client_count: 204,
      },
      now,
      65,
      20
    ),
    {
      ...voltage,
      id: `NO_VOLTAGE:ND01120A02-R:${voltage.started_at}`,
      alert_type: 'NO_VOLTAGE',
      source_id: 'ND01120A02-R',
      openings: [],
    },
    {
      ...phase,
      id: `PHASE_LOSS:ND01120A02-T1:B:${phase.started_at}`,
      alert_type: 'PHASE_LOSS',
      device: 'SMAC',
      source_id: 'ND01120A02-T1',
      channel: 'B',
      openings: [],
    },
  ]
}
