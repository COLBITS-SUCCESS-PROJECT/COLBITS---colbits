/** MSW handler for the fault indicators (US21) — the aggregation of backend/src/faults/fault-indicators.service.ts over the mock faults of the caller's scope. */
import { http, HttpResponse } from 'msw'
import { FAULT_INDICATORS_ENDPOINT } from '@/features/analysis/api/indicators.api'
import type {
  FaultIndicatorsResponseDto,
  LongestFaultDto,
} from '@/features/analysis/api/indicators.dto'
import type { PhaseClassification } from '@/features/analysis/model/history.types'
import { dayNumber } from '../data/history.fixtures'
import { indicatorFaultsOf } from '../data/indicators.fixtures'
import { MOCK_SCOPES, NODE_FIXTURES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const BAD_REQUEST = 400
const MS_PER_DAY = 86_400_000
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
/** FAULT_MIN_DURATION_MINUTES of the backend's .env.example. */
const THRESHOLD_MINUTES = 1
const AVERAGE_DECIMALS = 2
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PHASES: Record<PhaseClassification, string[]> = {
  MONOPHASIC: ['R'],
  BIPHASIC: ['R', 'S'],
  TRIPHASIC: ['R', 'S', 'T'],
}

type MockNode = (typeof NODE_FIXTURES)[number]

const problem = (status: number, title: string, detail: string) =>
  HttpResponse.json({ title, detail, status }, { status })

const isoDay = (dayNo: number) => new Date(dayNo * MS_PER_DAY).toISOString().slice(0, 10)

/** The caller's nodes that are inside every scope filter of the request (the backend intersects them). */
function nodesOf(scope: string[] | null, params: URLSearchParams): MockNode[] {
  const id = (place: { id: number } | null | undefined) => String(place?.id)
  const wanted = (key: string, value: string) => !params.has(key) || params.get(key) === value
  return NODE_FIXTURES.filter(
    (node) =>
      (scope === null || scope.includes(node.name)) &&
      wanted('zone_id', id(node.zone)) &&
      wanted('substation_id', id(node.substation)) &&
      wanted('circuit_id', id(node.circuit)) &&
      wanted('node_id', node.name)
  )
}

function faultsOf(nodes: MockNode[], from: string, to: string): LongestFaultDto[] {
  const faults: LongestFaultDto[] = []
  for (let dayNo = dayNumber(from); dayNo <= dayNumber(to); dayNo++) {
    nodes.forEach((node, index) => {
      for (const fault of indicatorFaultsOf(node.name, isoDay(dayNo))) {
        const end = Date.parse(fault.startedAt) + fault.durationSeconds * MS_PER_SECOND
        faults.push({
          id: `${index + 1}:${fault.startedAt}`,
          node: node.name,
          circuit_id: node.circuit?.id ?? 0,
          circuit_name: node.circuit?.name ?? '',
          substation_id: node.substation?.id ?? 0,
          substation_name: node.substation?.name ?? '',
          fuses_set_id: index + 1,
          branch: 'A',
          classification: fault.classification,
          phases: fault.classification === null ? null : PHASES[fault.classification],
          state: 'RESOLVED',
          started_at: fault.startedAt,
          ended_at: new Date(end).toISOString(),
          duration_seconds: fault.durationSeconds,
        })
      }
    })
  }
  return faults
}

function countBy<R extends { fault_count: number }>(
  faults: LongestFaultDto[],
  keyOf: (fault: LongestFaultDto) => string | number,
  init: (fault: LongestFaultDto) => R,
  compare: (a: R, b: R) => number
): R[] {
  const counts = new Map<string | number, R>()
  for (const fault of faults) {
    const row = counts.get(keyOf(fault))
    if (row) row.fault_count += 1
    else counts.set(keyOf(fault), init(fault))
  }
  return [...counts.values()].sort(compare)
}

/** What GET /faults/indicators answers for these nodes and inclusive days. */
export function faultIndicatorsOf(
  nodes: MockNode[],
  from: string,
  to: string,
  minDurationFilter: boolean
): FaultIndicatorsResponseDto {
  const thresholdSeconds = THRESHOLD_MINUTES * SECONDS_PER_MINUTE
  const all = faultsOf(nodes, from, to)
  const faults = minDurationFilter
    ? all.filter((fault) => fault.duration_seconds > thresholdSeconds)
    : all
  const durations = faults.map((fault) => fault.duration_seconds)
  const codeOf = (id: number) =>
    NODE_FIXTURES.find((node) => node.substation?.id === id)?.substation?.code ?? ''
  const context = ({
    circuit_id,
    circuit_name,
    substation_id,
    substation_name,
  }: LongestFaultDto) => ({
    circuit_id,
    circuit_name,
    substation_id,
    substation_name,
  })

  return {
    generated_at: new Date().toISOString(),
    period: { from, to },
    minimum_duration_filter: {
      active: minDurationFilter,
      threshold_minutes: THRESHOLD_MINUTES,
      threshold_seconds: thresholdSeconds,
    },
    total_faults: faults.length,
    duration: {
      average_seconds: faults.length
        ? Number(
            (durations.reduce((sum, value) => sum + value, 0) / faults.length).toFixed(
              AVERAGE_DECIMALS
            )
          )
        : null,
      max_seconds: faults.length ? Math.max(...durations) : null,
    },
    by_substation: countBy(
      faults,
      (fault) => fault.substation_id,
      (fault) => ({
        substation_id: fault.substation_id,
        substation_code: codeOf(fault.substation_id),
        substation_name: fault.substation_name,
        fault_count: 1,
      }),
      (a, b) => b.fault_count - a.fault_count || a.substation_id - b.substation_id
    ),
    by_circuit: countBy(
      faults,
      (fault) => fault.circuit_id,
      (fault) => ({ ...context(fault), fault_count: 1 }),
      (a, b) => b.fault_count - a.fault_count || a.circuit_id - b.circuit_id
    ),
    node_ranking: countBy(
      faults,
      (fault) => fault.node,
      (fault) => ({ ...context(fault), node: fault.node, fault_count: 1 }),
      (a, b) => b.fault_count - a.fault_count || a.node.localeCompare(b.node)
    ),
    longest_faults: [...faults].sort(
      (a, b) =>
        b.duration_seconds - a.duration_seconds ||
        Date.parse(b.started_at) - Date.parse(a.started_at) ||
        a.id.localeCompare(b.id)
    ),
  }
}

/** Nodes the token may see, narrowed by the request's scope filters. */
export function indicatorNodesOf(token: string, params: URLSearchParams): MockNode[] {
  return nodesOf(MOCK_SCOPES[token] ?? null, params)
}

export const indicatorsHandlers = [
  http.get(`*${FAULT_INDICATORS_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
      return problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')
    }
    const params = new URL(request.url).searchParams
    const from = params.get('from')?.slice(0, 10) ?? ''
    const to = params.get('to')?.slice(0, 10) ?? ''
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
      return problem(BAD_REQUEST, 'Bad Request', 'from and to must be dates with from <= to')
    }
    const minDurationFilter = params.get('min_duration_filter') === 'true'
    return HttpResponse.json(
      faultIndicatorsOf(indicatorNodesOf(token, params), from, to, minDurationFilter)
    )
  }),
]
