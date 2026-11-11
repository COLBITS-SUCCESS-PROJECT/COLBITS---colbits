/** Pure filtering of the user list by free text (name or email) and status. */
import type { ManagedUser, UserFilters } from './users.types'

/** Lower-case and strip accents so "andres" finds "Andrés". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function filterUsers(users: ManagedUser[], filters: UserFilters): ManagedUser[] {
  const query = normalize(filters.search)

  return users.filter((user) => {
    if (filters.status !== 'ALL' && user.status !== filters.status) return false
    if (!query) return true
    return normalize(user.name).includes(query) || normalize(user.email).includes(query)
  })
}
