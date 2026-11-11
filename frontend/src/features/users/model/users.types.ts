/** Domain types of user management: consultation users and their data scope (F-05, F-07, F-08). */

/** Network levels a scope can be assigned at (F-08), from the widest to the narrowest. */
export type ScopeLevel = 'ZONE' | 'SUBSTATION' | 'CIRCUIT' | 'NODE' | 'DEVICE'

/** One network element in the scope tree. Leaves are devices. */
export interface ScopeNode {
  id: string
  level: ScopeLevel
  /** Code shown to the user, e.g. `Z-01`, `SE-Norte`, `CR-12`. */
  name: string
  /** Optional long name, e.g. `Distrito Norte` for a zone. */
  description?: string
  deviceCount: number
  children: ScopeNode[]
}

/** One element assigned to a user. The same element may be assigned to many users (F-09). */
export interface ScopeItem {
  id: string
  level: ScopeLevel
  name: string
}

export type UserStatus = 'ACTIVE' | 'INACTIVE'

export interface ManagedUser {
  id: string
  name: string
  email: string
  status: UserStatus
  scope: ScopeItem[]
}

export type UserStatusFilter = 'ALL' | UserStatus

export interface UserFilters {
  search: string
  status: UserStatusFilter
}
