/** Constants of user management: scope level icons, list limits and filter options. */
import type { IconName } from '@/design-system/atoms'
import type { ScopeLevel, UserFilters, UserStatusFilter } from './users.types'

/** Icon of each network level (Figma: Scope Tag · Zone map / Substation building / Circuit layers). */
export const SCOPE_LEVEL_ICON: Record<ScopeLevel, IconName> = {
  ZONE: 'map',
  SUBSTATION: 'building',
  CIRCUIT: 'layers',
  NODE: 'pin',
  DEVICE: 'signal',
}

/** Depth of each level in the scope tree (Scope Tree Row indentation). */
export const SCOPE_LEVEL_DEPTH: Record<ScopeLevel, 0 | 1 | 2 | 3 | 4> = {
  ZONE: 0,
  SUBSTATION: 1,
  CIRCUIT: 2,
  NODE: 3,
  DEVICE: 4,
}

/** Scope tags shown in a user row before the "+N more" counter (Figma: User Row). */
export const MAX_VISIBLE_SCOPE_TAGS = 2

export const USER_STATUS_FILTERS: UserStatusFilter[] = ['ALL', 'ACTIVE', 'INACTIVE']

export const INITIAL_USER_FILTERS: UserFilters = { search: '', status: 'ALL' }
