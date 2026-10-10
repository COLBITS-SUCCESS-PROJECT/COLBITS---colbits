/**
 * PROVISIONAL sample nodes in Cali, Colombia (where Colbits operates) and mock user scopes,
 * until the backend node service and the synthetic generator exist (US1, US3).
 */
import type { NodeDto } from '@/features/dashboard/api/nodes.dto'

export const NODE_FIXTURES: NodeDto[] = [
  {
    id: 'ND04821A07',
    latitude: 3.469,
    longitude: -76.529,
    fuse_state: 'CRITICAL',
    transformer_state: 'NORMAL',
  },
  {
    id: 'ND01120A02',
    latitude: 3.4612,
    longitude: -76.5225,
    fuse_state: 'NORMAL',
    transformer_state: 'NORMAL',
  },
  {
    id: 'ND03377A15',
    latitude: 3.455,
    longitude: -76.5375,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    id: 'ND02218B09',
    latitude: 3.4498,
    longitude: -76.5198,
    fuse_state: 'NORMAL',
    transformer_state: 'WARNING',
  },
  {
    id: 'ND08890C04',
    latitude: 3.4431,
    longitude: -76.5402,
    fuse_state: 'INACTIVE',
    transformer_state: null,
  },
  {
    id: 'ND01543B11',
    latitude: 3.4372,
    longitude: -76.5311,
    fuse_state: 'NORMAL',
    transformer_state: null,
  },
  {
    id: 'ND05510C11',
    latitude: 3.452,
    longitude: -76.5285,
    fuse_state: 'CRITICAL',
    transformer_state: 'NORMAL',
  },
  {
    id: 'ND06420A08',
    latitude: 3.4305,
    longitude: -76.524,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    id: 'ND07120D05',
    latitude: 3.4218,
    longitude: -76.5365,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    id: 'ND06102B03',
    latitude: 3.4655,
    longitude: -76.512,
    fuse_state: null,
    transformer_state: 'CRITICAL',
  },
  {
    id: 'ND07740D02',
    latitude: 3.476,
    longitude: -76.534,
    fuse_state: null,
    transformer_state: 'WARNING',
  },
  {
    id: 'ND09931A01',
    latitude: 3.414,
    longitude: -76.529,
    fuse_state: null,
    transformer_state: 'NORMAL',
  },
  {
    id: 'ND04410C07',
    latitude: 3.4405,
    longitude: -76.508,
    fuse_state: null,
    transformer_state: 'INACTIVE',
  },
  {
    id: 'ND02287B14',
    latitude: 3.4585,
    longitude: -76.548,
    fuse_state: null,
    transformer_state: 'NORMAL',
  },
]

/** Access tokens of the mock users. `DEV` is the one used by `mocks/devSession.ts`. */
export const MOCK_TOKENS = {
  DEV: 'dev-token',
  NORTH: 'mock-token-north',
  SOUTH: 'mock-token-south',
  NO_SCOPE: 'mock-token-no-scope',
} as const

const NORTH_NODE_IDS = ['ND04821A07', 'ND01120A02', 'ND06102B03', 'ND07740D02']
const SOUTH_NODE_IDS = ['ND06420A08', 'ND07120D05', 'ND09931A01']

/** Node IDs each mock user may see. `null` = whole network (administrator / dev user). */
export const MOCK_SCOPES: Record<string, string[] | null> = {
  [MOCK_TOKENS.DEV]: null,
  [MOCK_TOKENS.NORTH]: NORTH_NODE_IDS,
  [MOCK_TOKENS.SOUTH]: SOUTH_NODE_IDS,
  [MOCK_TOKENS.NO_SCOPE]: [],
}
