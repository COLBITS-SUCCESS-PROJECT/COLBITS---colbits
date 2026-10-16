/** MSW handlers for the node service — returns only the nodes in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { NODES_ENDPOINT } from '@/features/dashboard/api/nodes.api'
import { MOCK_SCOPES, NODE_FIXTURES } from '../data/nodes.fixtures'

const BEARER_PREFIX = 'Bearer '
const UNAUTHORIZED = 401

export const nodesHandlers = [
  http.get(`*${NODES_ENDPOINT}`, ({ request }) => {
    const authorization = request.headers.get('Authorization') ?? ''
    const token = authorization.startsWith(BEARER_PREFIX)
      ? authorization.slice(BEARER_PREFIX.length)
      : ''

    if (!(token in MOCK_SCOPES)) {
      return HttpResponse.json(
        { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
        { status: UNAUTHORIZED }
      )
    }

    const scope = MOCK_SCOPES[token]
    const nodes = scope === null ? NODE_FIXTURES : NODE_FIXTURES.filter((n) => scope.includes(n.id))
    return HttpResponse.json(nodes)
  }),
]
