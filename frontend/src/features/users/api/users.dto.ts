/** Raw shapes of the user service exactly as backend/src/users/dto/users.dto.ts sends them (US19). */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/users/SCRUM-250.md §6)

export type UserRoleDto = 'Colbits administrator' | 'consultation user'

/** Hierarchy level of one scope assignment (F-08). */
export type ScopeEntityTypeDto = 'zone' | 'substation' | 'circuit' | 'node' | 'device'

export interface ScopeAssignmentDto {
  entity_type: ScopeEntityTypeDto
  /** Zone, substation or circuit id; node name; device hardware id. */
  entity_id: string
}

/** GET /users item and the body every write answers with. */
export interface UserDto {
  id: number
  /** The user's email: the backend logs in with it. */
  username: string
  /**
   * PROVISIONAL — not sent by the backend yet (proposed to the backend team). Until it exists the
   * views show the email as the name.
   */
  full_name?: string | null
  role: UserRoleDto
  is_active: boolean
  scopes: ScopeAssignmentDto[]
}

/** POST /users. */
export interface CreateUserRequestDto {
  username: string
  /** PROVISIONAL — the backend ignores it until it stores the name. */
  full_name: string
  /** Required by the backend today (min. 6 characters). Q3 asks the backend to generate it. */
  password: string
  role: 'consultation user'
  scopes: ScopeAssignmentDto[]
}

/** PATCH /users/:id — every field is optional on the backend; the views send the ones they edit. */
export interface UpdateUserRequestDto {
  username?: string
  /** PROVISIONAL — the backend ignores it until it stores the name. */
  full_name?: string
  is_active?: boolean
  scopes?: ScopeAssignmentDto[]
}

/**
 * The part of GET /nodes the scope picker uses (backend/src/nodes, since US14). For the administrator
 * the backend applies no scope filter (F-04), so these nodes are the whole network.
 */
export interface NetworkNodeDto {
  name: string
  zone?: { id: number; name: string } | null
  substation?: { id: number; code: string; name: string } | null
  circuit?: { id: number; name: string } | null
  device_ids?: string[]
}

export interface NetworkNodesResponseDto {
  count: number
  nodes: NetworkNodeDto[]
}
