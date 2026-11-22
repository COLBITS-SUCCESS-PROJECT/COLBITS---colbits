/**
 * Id of a network element in the scope tree: its level and the id the backend stores in
 * `user_scopes.entity_id` (e.g. `CIRCUIT:3`, `NODE:ND04821A07`, `DEVICE:1304821A07`). The level is part
 * of the id because a zone and a circuit can share the same number.
 */
import type { ScopeLevel } from './users.types'

const SEPARATOR = ':'

export function scopeNodeId(level: ScopeLevel, entityId: string): string {
  return `${level}${SEPARATOR}${entityId}`
}

/** The backend id of the element: everything after the level. */
export function scopeEntityId(scopeNodeIdValue: string): string {
  const index = scopeNodeIdValue.indexOf(SEPARATOR)
  return index === -1 ? scopeNodeIdValue : scopeNodeIdValue.slice(index + SEPARATOR.length)
}
