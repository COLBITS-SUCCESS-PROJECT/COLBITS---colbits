/**
 * Sample network tree and consultation users (Figma: Admin / User list) used while the user
 * endpoints are built. TODO SCRUM-117: replace with GET /users and the scope tree from the API.
 */
import type { ManagedUser, ScopeItem, ScopeLevel, ScopeNode } from './users.types'

function scopeNode(
  level: ScopeLevel,
  name: string,
  children: ScopeNode[] = [],
  description?: string
): ScopeNode {
  const deviceCount =
    level === 'DEVICE' ? 1 : children.reduce((total, child) => total + child.deviceCount, 0)
  return { id: `${level}:${name}`, level, name, description, deviceCount, children }
}

const device = (name: string) => scopeNode('DEVICE', name)

export const SAMPLE_SCOPE_TREE: ScopeNode[] = [
  scopeNode(
    'ZONE',
    'Z-01',
    [
      scopeNode('SUBSTATION', 'SE-Norte', [
        scopeNode('CIRCUIT', 'CR-12', [
          scopeNode('NODE', 'ND04821A07', [device('FAL-00412'), device('SMAC-00118')]),
        ]),
        scopeNode('CIRCUIT', 'CR-14', [scopeNode('NODE', 'ND04822B03', [device('FAL-00415')])]),
      ]),
      scopeNode('SUBSTATION', 'SE-Sur', [
        scopeNode('CIRCUIT', 'CR-21', [scopeNode('NODE', 'ND04910C11', [device('FAL-00502')])]),
      ]),
    ],
    'Distrito Norte'
  ),
  scopeNode(
    'ZONE',
    'Z-02',
    [
      scopeNode('SUBSTATION', 'SE-Oriente', [
        scopeNode('CIRCUIT', 'CR-07', [
          scopeNode('NODE', 'ND05530B12', [device('FAL-00877'), device('SMAC-00241')]),
        ]),
      ]),
    ],
    'Distrito Oriente'
  ),
  scopeNode(
    'ZONE',
    'Z-03',
    [
      scopeNode('SUBSTATION', 'SE-Occidente', [
        scopeNode('CIRCUIT', 'CR-30', [scopeNode('NODE', 'ND06102D05', [device('FAL-00933')])]),
      ]),
    ],
    'Distrito Occidente'
  ),
]

const item = (level: ScopeLevel, name: string): ScopeItem => ({
  id: `${level}:${name}`,
  level,
  name,
})

export const SAMPLE_USERS: ManagedUser[] = [
  {
    id: 'u-1',
    name: 'Laura Gómez',
    email: 'laura.gomez@colbits.com',
    status: 'ACTIVE',
    scope: [item('ZONE', 'Z-01'), item('CIRCUIT', 'CR-07'), item('DEVICE', 'FAL-00933')],
  },
  {
    // Shares Z-01 and CR-07 with Laura: one element may belong to several users (F-09).
    id: 'u-2',
    name: 'Carlos Pérez',
    email: 'carlos.perez@colbits.com',
    status: 'ACTIVE',
    scope: [item('ZONE', 'Z-01'), item('CIRCUIT', 'CR-07')],
  },
  {
    id: 'u-3',
    name: 'Diana Rojas',
    email: 'diana.rojas@colbits.com',
    status: 'ACTIVE',
    scope: [
      item('ZONE', 'Z-02'),
      item('CIRCUIT', 'CR-21'),
      item('NODE', 'ND04822B03'),
      item('DEVICE', 'FAL-00412'),
    ],
  },
  {
    id: 'u-4',
    name: 'Andrés Ibarra',
    email: 'andres.ibarra@colbits.com',
    status: 'INACTIVE',
    scope: [item('SUBSTATION', 'SE-Norte'), item('NODE', 'ND06102D05')],
  },
  {
    id: 'u-5',
    name: 'Sofía Martínez',
    email: 'sofia.martinez@colbits.com',
    status: 'ACTIVE',
    scope: [item('ZONE', 'Z-03'), item('DEVICE', 'FAL-00502'), item('DEVICE', 'FAL-00415')],
  },
]
