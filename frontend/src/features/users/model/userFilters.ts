/** Pure filtering of the user list by free text (name or email) and status. */
import { normalizeSearch } from './normalizeSearch'
import type { ManagedUser, UserFilters } from './users.types'

export function filterUsers(users: ManagedUser[], filters: UserFilters): ManagedUser[] {
  const query = normalizeSearch(filters.search)

  return users.filter((user) => {
    if (filters.status !== 'ALL' && user.status !== filters.status) return false
    if (!query) return true
    return normalizeSearch(user.name).includes(query) || normalizeSearch(user.email).includes(query)
  })
}
