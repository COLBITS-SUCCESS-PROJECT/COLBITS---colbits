/** Unit tests for the user mapper — input is exactly what backend/src/users and backend/src/nodes return. */
import { describe, it, expect } from 'vitest'
import type { UserFormValues } from '../schemas/userForm.schema'
import type { NetworkNodesResponseDto, UserDto } from './users.dto'
import {
  toCreateUserRequest,
  toManagedUser,
  toManagedUsers,
  toScopeTree,
  toUpdateUserRequest,
} from './users.mapper'

const CONSULTATION: UserDto = {
  id: 2,
  username: 'client@colbits.com',
  role: 'consultation user',
  is_active: true,
  scopes: [
    { entity_type: 'circuit', entity_id: '3' },
    { entity_type: 'device', entity_id: '1304821A07' },
  ],
}

const ADMIN: UserDto = {
  id: 1,
  username: 'admin@colbits.com',
  role: 'Colbits administrator',
  is_active: true,
  scopes: [],
}

const FORM: UserFormValues = {
  name: 'Laura Gómez',
  email: 'laura@client.co',
  scope: [
    { id: 'ZONE:1', level: 'ZONE', name: 'Zona Norte' },
    { id: 'NODE:ND04821A07', level: 'NODE', name: 'ND04821A07' },
  ],
}

describe('toManagedUser', () => {
  it('maps the email, the status and each assignment to a scope item named by its id', () => {
    expect(toManagedUser({ ...CONSULTATION, is_active: false })).toEqual({
      id: '2',
      name: 'client@colbits.com',
      email: 'client@colbits.com',
      status: 'INACTIVE',
      scope: [
        { id: 'CIRCUIT:3', level: 'CIRCUIT', name: '3' },
        { id: 'DEVICE:1304821A07', level: 'DEVICE', name: '1304821A07' },
      ],
    })
  })

  it('shows the full name once the backend sends it', () => {
    expect(toManagedUser({ ...CONSULTATION, full_name: ' Laura Gómez ' }).name).toBe('Laura Gómez')
  })
})

describe('toManagedUsers', () => {
  it('leaves the administrators out', () => {
    expect(toManagedUsers([ADMIN, CONSULTATION]).map((user) => user.id)).toEqual(['2'])
  })
})

describe('requests', () => {
  it('creates a consultation user with the email as username and the scope as assignments', () => {
    expect(toCreateUserRequest(FORM, 'Temp-1234')).toEqual({
      username: 'laura@client.co',
      full_name: 'Laura Gómez',
      password: 'Temp-1234',
      role: 'consultation user',
      scopes: [
        { entity_type: 'zone', entity_id: '1' },
        { entity_type: 'node', entity_id: 'ND04821A07' },
      ],
    })
  })

  it('updates the name, the email and the scope only', () => {
    expect(toUpdateUserRequest(FORM)).toEqual({
      username: 'laura@client.co',
      full_name: 'Laura Gómez',
      scopes: [
        { entity_type: 'zone', entity_id: '1' },
        { entity_type: 'node', entity_id: 'ND04821A07' },
      ],
    })
  })
})

describe('toScopeTree', () => {
  const NORTH = { id: 1, name: 'Zona Norte' }
  const SUBSTATION = { id: 7, code: 'SE-01', name: 'Subestación Norte' }

  it('nests the nodes under their circuit, substation and zone and counts the devices', () => {
    const dto: NetworkNodesResponseDto = {
      count: 2,
      nodes: [
        {
          name: 'ND2',
          zone: NORTH,
          substation: SUBSTATION,
          circuit: { id: 3, name: 'CTO 1' },
          device_ids: ['13ND2'],
        },
        {
          name: 'ND1',
          zone: NORTH,
          substation: SUBSTATION,
          circuit: { id: 3, name: 'CTO 1' },
          device_ids: ['05ND1', '13ND1'],
        },
      ],
    }

    const device = (id: string) => ({
      id: `DEVICE:${id}`,
      level: 'DEVICE',
      name: id,
      deviceCount: 1,
      children: [],
    })
    expect(toScopeTree(dto)).toEqual([
      {
        id: 'ZONE:1',
        level: 'ZONE',
        name: 'Zona Norte',
        deviceCount: 3,
        children: [
          {
            id: 'SUBSTATION:7',
            level: 'SUBSTATION',
            name: 'SE-01',
            description: 'Subestación Norte',
            deviceCount: 3,
            children: [
              {
                id: 'CIRCUIT:3',
                level: 'CIRCUIT',
                name: 'CTO 1',
                deviceCount: 3,
                children: [
                  {
                    id: 'NODE:ND1',
                    level: 'NODE',
                    name: 'ND1',
                    deviceCount: 2,
                    children: [device('05ND1'), device('13ND1')],
                  },
                  {
                    id: 'NODE:ND2',
                    level: 'NODE',
                    name: 'ND2',
                    deviceCount: 1,
                    children: [device('13ND2')],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it('leaves out a node without a location and orders names with numbers naturally', () => {
    const at = (circuit: { id: number; name: string }) => ({
      zone: NORTH,
      substation: SUBSTATION,
      circuit,
    })
    const dto: NetworkNodesResponseDto = {
      count: 3,
      nodes: [
        { name: 'ND3', ...at({ id: 10, name: 'CTO 10' }) },
        { name: 'ND4', ...at({ id: 2, name: 'CTO 2' }) },
        { name: 'ND5', zone: null, substation: null, circuit: null },
      ],
    }

    const circuits = toScopeTree(dto)[0]?.children[0]?.children ?? []
    expect(circuits.map((circuit) => circuit.name)).toEqual(['CTO 2', 'CTO 10'])
    expect(circuits.flatMap((circuit) => circuit.children).map((node) => node.name)).toEqual([
      'ND4',
      'ND3',
    ])
  })
})
