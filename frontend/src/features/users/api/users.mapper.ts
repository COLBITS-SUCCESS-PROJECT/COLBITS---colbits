/** User service DTOs ↔ model: the firewall between the backend shapes and the views (AGENT.md §11). */
import { scopeEntityId, scopeNodeId } from '../model/scopeId'
import type { ManagedUser, ScopeItem, ScopeLevel, ScopeNode } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'
import type {
  CreateUserRequestDto,
  NetworkNodesResponseDto,
  ScopeAssignmentDto,
  ScopeEntityTypeDto,
  UpdateUserRequestDto,
  UserDto,
} from './users.dto'

const LEVEL_BY_ENTITY_TYPE: Record<ScopeEntityTypeDto, ScopeLevel> = {
  zone: 'ZONE',
  substation: 'SUBSTATION',
  circuit: 'CIRCUIT',
  node: 'NODE',
  device: 'DEVICE',
}

const ENTITY_TYPE_BY_LEVEL: Record<ScopeLevel, ScopeEntityTypeDto> = {
  ZONE: 'zone',
  SUBSTATION: 'substation',
  CIRCUIT: 'circuit',
  NODE: 'node',
  DEVICE: 'device',
}

const CONSULTATION_ROLE = 'consultation user'

/** Until the scope tree is known, an assigned element is shown by its backend id. */
function toScopeItem(dto: ScopeAssignmentDto): ScopeItem[] {
  const level = LEVEL_BY_ENTITY_TYPE[dto.entity_type]
  if (!level) return []
  return [{ id: scopeNodeId(level, dto.entity_id), level, name: dto.entity_id }]
}

export function toManagedUser(dto: UserDto): ManagedUser {
  return {
    id: String(dto.id),
    name: dto.full_name?.trim() || dto.username,
    email: dto.username,
    status: dto.is_active ? 'ACTIVE' : 'INACTIVE',
    scope: dto.scopes.flatMap(toScopeItem),
  }
}

/** The page manages consultation users only (spec Q2): administrators are left out. */
export function toManagedUsers(dtos: UserDto[]): ManagedUser[] {
  return dtos.filter((dto) => dto.role === CONSULTATION_ROLE).map(toManagedUser)
}

export function toScopeAssignments(scope: ScopeItem[]): ScopeAssignmentDto[] {
  return scope.map((item) => ({
    entity_type: ENTITY_TYPE_BY_LEVEL[item.level],
    entity_id: scopeEntityId(item.id),
  }))
}

export function toCreateUserRequest(
  values: UserFormValues,
  temporaryPassword: string
): CreateUserRequestDto {
  return {
    username: values.email,
    full_name: values.name,
    password: temporaryPassword,
    role: CONSULTATION_ROLE,
    scopes: toScopeAssignments(values.scope),
  }
}

export function toUpdateUserRequest(values: UserFormValues): UpdateUserRequestDto {
  return {
    username: values.email,
    full_name: values.name,
    scopes: toScopeAssignments(values.scope),
  }
}

interface Branch {
  id: string
  level: ScopeLevel
  name: string
  description?: string
  children: Map<string, Branch>
}

function branchOf(
  parent: Map<string, Branch>,
  level: ScopeLevel,
  entityId: string,
  name: string,
  description?: string
): Branch {
  const id = scopeNodeId(level, entityId)
  let branch = parent.get(id)
  if (!branch) {
    branch = { id, level, name, description, children: new Map() }
    parent.set(id, branch)
  }
  return branch
}

const byName = (a: ScopeNode, b: ScopeNode) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

function toScopeNodes(branches: Map<string, Branch>): ScopeNode[] {
  return [...branches.values()]
    .map(({ children: childBranches, ...element }) => {
      const children = toScopeNodes(childBranches)
      const deviceCount =
        element.level === 'DEVICE'
          ? 1
          : children.reduce((total, child) => total + child.deviceCount, 0)
      return { ...element, deviceCount, children }
    })
    .sort(byName)
}

/**
 * Network tree of the scope picker (F-08) from the nodes and their location: zones › substations ›
 * circuits › nodes › devices. A node the backend sends without a location cannot be placed and is
 * left out; so are zones, substations and circuits that have no node yet.
 */
export function toScopeTree(dto: NetworkNodesResponseDto): ScopeNode[] {
  const zones = new Map<string, Branch>()
  for (const node of dto.nodes) {
    if (!node.zone || !node.substation || !node.circuit) continue
    const zone = branchOf(zones, 'ZONE', String(node.zone.id), node.zone.name)
    const { id, code, name } = node.substation
    // Shown by its code, with the long name as description (e.g. `SE-01` · `Subestación Norte`).
    const substation = code
      ? branchOf(zone.children, 'SUBSTATION', String(id), code, name)
      : branchOf(zone.children, 'SUBSTATION', String(id), name)
    const circuit = branchOf(
      substation.children,
      'CIRCUIT',
      String(node.circuit.id),
      node.circuit.name
    )
    const element = branchOf(circuit.children, 'NODE', node.name, node.name)
    for (const deviceId of node.device_ids ?? []) {
      branchOf(element.children, 'DEVICE', deviceId, deviceId)
    }
  }
  return toScopeNodes(zones)
}
