/** MSW handlers for the node service — returns only the nodes in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { NODES_ENDPOINT } from '@/features/dashboard/api/nodes.api'
import { nodeDetailFixture } from '../data/nodeDetail.fixtures'
import { MOCK_SCOPES, NODE_FIXTURES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const NOT_FOUND = 404

const unauthorized = () =>
  HttpResponse.json(
    { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
    { status: UNAUTHORIZED }
  )

export const nodesHandlers = [
  http.get(`*${NODES_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)

    // F-02: no data without a valid token; F-11: a logged-out token is no longer valid.
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) return unauthorized()

    const scope = MOCK_SCOPES[token]
    const nodes =
      scope === null ? NODE_FIXTURES : NODE_FIXTURES.filter((n) => scope.includes(n.name))
    // Same shape as backend/src/nodes/nodes.service.ts → { count, nodes }
    return HttpResponse.json({ count: nodes.length, nodes })
  }),

  // F-27: same shape as backend/src/nodes/node-detail.service.ts; 404 outside the scope (F-10).
  http.get(`*${NODES_ENDPOINT}/:name/detail`, ({ request, params }) => {
    const token = bearerToken(request)
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) return unauthorized()

    const scope = MOCK_SCOPES[token]
    const node = NODE_FIXTURES.find((n) => n.name === params['name'])
    if (!node || (scope !== null && !scope.includes(node.name))) {
      return HttpResponse.json(
        { title: 'Not Found', detail: 'Node not found', status: NOT_FOUND },
        { status: NOT_FOUND }
      )
    }
    return HttpResponse.json(nodeDetailFixture(node))
  }),
]
