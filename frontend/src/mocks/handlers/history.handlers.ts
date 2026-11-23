/** MSW handler for the fault history (US20) â€” aggregates the mock faults of the caller's scope and filters like the proposed API. */
import { http, HttpResponse } from 'msw'
import { FAULT_HISTORY_ENDPOINT } from '@/features/analysis/api/history.api'
import type { FaultHistoryResponseDto, TrendIntervalDto } from '@/features/analysis/api/history.dto'
import { dayNumber, historyEventsOf, type HistoryEventFixture } from '../data/history.fixtures'
import { MOCK_SCOPES, NODE_FIXTURES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const BAD_REQUEST = 400
const MS_PER_DAY = 86_400_000
/** Longest range drawn per day / per week; longer ones are drawn per month. */
const MAX_DAILY_DAYS = 62
const DAYS_PER_WEEK = 7
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const problem = (status: number, title: string, detail: string) =>
  HttpResponse.json({ title, detail, status }, { status })

const isoDay = (dayNo: number) => new Date(dayNo * MS_PER_DAY).toISOString().slice(0, 10)

function intervalOf(days: number): TrendIntervalDto {
  return days <= MAX_DAILY_DAYS ? 'day' : 'week'
}

function bucketStart(day: string, interval: TrendIntervalDto): string {
  if (interval === 'day') return day
  const sinceMonday = (new Date(day).getUTCDay() + 6) % DAYS_PER_WEEK
  return isoDay(dayNumber(day) - sinceMonday)
}

/** Nodes of the request: the caller's scope narrowed by zone / substation / circuit / node. */
function nodesOf(scope: string[] | null, params: URLSearchParams): string[] {
  const id = (place: { id: number } | null | undefined) => String(place?.id)
  const wanted = (key: string, value: string) => !params.has(key) || params.get(key) === value
  return NODE_FIXTURES.filter(
    (node) =>
      (scope === null || scope.includes(node.name)) &&
      wanted('zone_id', id(node.zone)) &&
      wanted('substation_id', id(node.substation)) &&
      wanted('circuit_id', id(node.circuit)) &&
      wanted('node', node.name)
  ).map((node) => node.name)
}

export function faultHistoryOf(
  nodes: string[],
  from: string,
  to: string
): FaultHistoryResponseDto & Required<Pick<FaultHistoryResponseDto, 'phase_distribution'>> {
  const first = dayNumber(from)
  const last = dayNumber(to)
  const interval = intervalOf(last - first + 1)
  const trend = new Map<string, { fuse_faults: number; voltage_alarms: number }>()
  const events: HistoryEventFixture[] = []
  for (let dayNo = first; dayNo <= last; dayNo++) {
    const day = isoDay(dayNo)
    const start = bucketStart(day, interval)
    if (!trend.has(start)) trend.set(start, { fuse_faults: 0, voltage_alarms: 0 })
    for (const node of nodes) events.push(...historyEventsOf(node, day))
  }
  for (const event of events) {
    const point = trend.get(bucketStart(event.day, interval))
    if (point && event.type === 'FUSE_OPENING') point.fuse_faults++
    if (point && event.type === 'NO_VOLTAGE') point.voltage_alarms++
  }
  const count = (classification: string) =>
    events.filter((event) => event.classification === classification).length
  const points = [...trend.entries()].map(([start, values]) => ({
    start: start + 'T05:00:00.000Z',
    ...values,
  }))
  return {
    from,
    to,
    interval,
    totals: {
      fuse_faults: points.reduce((sum, p) => sum + p.fuse_faults, 0),
      voltage_alarms: points.reduce((sum, p) => sum + p.voltage_alarms, 0),
    },
    series: points,
    phase_distribution: {
      monophasic: count('MONOPHASIC'),
      biphasic: count('BIPHASIC'),
      triphasic: count('TRIPHASIC'),
    },
  }
}

export const historyHandlers = [
  http.get(`*${FAULT_HISTORY_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
      return problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')
    }
    const params = new URL(request.url).searchParams
    const from = params.get('from')?.slice(0, 10) ?? ''
    const end = params.get('to')?.slice(0, 10) ?? ''
    const to = ISO_DATE.test(end) ? isoDay(dayNumber(end) - 1) : ''
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
      return problem(BAD_REQUEST, 'Bad Request', 'from and to must be dates with from <= to')
    }
    return HttpResponse.json(faultHistoryOf(nodesOf(MOCK_SCOPES[token] ?? null, params), from, to))
  }),
]
