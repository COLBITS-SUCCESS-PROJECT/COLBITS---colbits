/** MSW handlers for the node service — returns only the nodes in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { NODES_ENDPOINT } from '@/features/dashboard/api/nodes.api'
import { MOCK_SCOPES, NODE_FIXTURES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401

export const nodesHandlers = [
  http.get(`*${NODES_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)

    // F-02: no data without a valid token; F-11: a logged-out token is no longer valid.
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
      return HttpResponse.json(
        { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
        { status: UNAUTHORIZED }
      )
    }

    const scope = MOCK_SCOPES[token]
    const nodes =
      scope === null ? NODE_FIXTURES : NODE_FIXTURES.filter((n) => scope.includes(n.name))
    // Same shape as backend/src/nodes/nodes.service.ts → { count, nodes }
    return HttpResponse.json({ count: nodes.length, nodes })
  }),
]
