/**
 * PROVISIONAL sample nodes in Cali, Colombia (where Colbits operates) and mock user scopes,
 * until the backend node service and the synthetic generator exist (US1, US3).
 */
import type { NodeDto } from '@/features/dashboard/api/nodes.dto'
import { MOCK_LOGIN_TOKENS } from './auth.fixtures'

const BASE_NODES: NodeDto[] = [
  {
    name: 'ND04821A07',
    latitude: 3.469,
    longitude: -76.529,
    fuse_state: 'CRITICAL',
    transformer_state: 'NORMAL',
  },
  {
    name: 'ND01120A02',
    latitude: 3.4612,
    longitude: -76.5225,
    fuse_state: 'NORMAL',
    transformer_state: 'NORMAL',
  },
  {
    name: 'ND03377A15',
    latitude: 3.455,
    longitude: -76.5375,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    name: 'ND02218B09',
    latitude: 3.4498,
    longitude: -76.5198,
    fuse_state: 'NORMAL',
    transformer_state: 'WARNING',
  },
  {
    name: 'ND08890C04',
    latitude: 3.4431,
    longitude: -76.5402,
    fuse_state: 'INACTIVE',
    transformer_state: null,
  },
  {
    name: 'ND01543B11',
    latitude: 3.4372,
    longitude: -76.5311,
    fuse_state: 'NORMAL',
    transformer_state: null,
  },
  {
    name: 'ND05510C11',
    latitude: 3.452,
    longitude: -76.5285,
    fuse_state: 'CRITICAL',
    transformer_state: 'NORMAL',
  },
  {
    name: 'ND06420A08',
    latitude: 3.4305,
    longitude: -76.524,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    name: 'ND07120D05',
    latitude: 3.4218,
    longitude: -76.5365,
    fuse_state: 'WARNING',
    transformer_state: null,
  },
  {
    name: 'ND06102B03',
    latitude: 3.4655,
    longitude: -76.512,
    fuse_state: null,
    transformer_state: 'CRITICAL',
  },
  {
    name: 'ND07740D02',
    latitude: 3.476,
    longitude: -76.534,
    fuse_state: null,
    transformer_state: 'WARNING',
  },
  {
    name: 'ND09931A01',
    latitude: 3.414,
    longitude: -76.529,
    fuse_state: null,
    transformer_state: 'NORMAL',
  },
  {
    name: 'ND04410C07',
    latitude: 3.4405,
    longitude: -76.508,
    fuse_state: null,
    transformer_state: 'INACTIVE',
  },
  {
    name: 'ND02287B14',
    latitude: 3.4585,
    longitude: -76.548,
    fuse_state: null,
    transformer_state: 'NORMAL',
  },
]

const NORTH_1 = { id: 1, code: 'SUB-N-001', name: 'S/E NORTE 1' }
const SOUTH_1 = { id: 2, code: 'SUB-S-001', name: 'S/E SUR 1' }
const CENTER_1 = { id: 3, code: 'SUB-C-001', name: 'S/E CENTRO 1' }

/** Zone › substation › circuit of each sample node (US14). "CTO 1" exists in two substations, as in the real data. */
const LOCATIONS: Record<string, Pick<NodeDto, 'zone' | 'substation' | 'circuit'>> = {
  ND04821A07: {
    zone: { id: 1, name: 'Zona Norte' },
    substation: NORTH_1,
    circuit: { id: 1, name: 'CTO 1' },
  },
  ND01120A02: {
    zone: { id: 1, name: 'Zona Norte' },
    substation: NORTH_1,
    circuit: { id: 1, name: 'CTO 1' },
  },
  ND06102B03: {
    zone: { id: 1, name: 'Zona Norte' },
    substation: NORTH_1,
    circuit: { id: 2, name: 'CTO 2' },
  },
  ND07740D02: {
    zone: { id: 1, name: 'Zona Norte' },
    substation: NORTH_1,
    circuit: { id: 2, name: 'CTO 2' },
  },
  ND06420A08: {
    zone: { id: 2, name: 'Zona Sur' },
    substation: SOUTH_1,
    circuit: { id: 3, name: 'CTO 1' },
  },
  ND07120D05: {
    zone: { id: 2, name: 'Zona Sur' },
    substation: SOUTH_1,
    circuit: { id: 3, name: 'CTO 1' },
  },
  ND09931A01: {
    zone: { id: 2, name: 'Zona Sur' },
    substation: SOUTH_1,
    circuit: { id: 3, name: 'CTO 1' },
  },
}
const CENTER = {
  zone: { id: 1, name: 'Zona Norte' },
  substation: CENTER_1,
  circuit: { id: 4, name: 'CTO 3' },
}

/** Installed devices: one Falcon ("13…") on a node with fuses, one SMAC ("05…") on a node with a transformer. */
function devicesOf(node: NodeDto): string[] {
  const suffix = node.name.slice(2)
  return [
    ...(node.transformer_state === null ? [] : [`05${suffix}`]),
    ...(node.fuse_state === null ? [] : [`13${suffix}`]),
  ]
}

/** Same shape as backend GET /nodes since US14: location and installed devices included. */
export const NODE_FIXTURES: NodeDto[] = BASE_NODES.map((node) => ({
  ...node,
  ...(LOCATIONS[node.name] ?? CENTER),
  device_ids: devicesOf(node),
}))

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
  // Users of the mock login (auth.fixtures.ts)
  [MOCK_LOGIN_TOKENS.ADMIN]: null,
  [MOCK_LOGIN_TOKENS.CONSULTA]: NORTH_NODE_IDS,
}
