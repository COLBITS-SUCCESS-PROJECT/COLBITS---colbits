/**
 * In-memory list of consultation users and the actions on it, while the user endpoints are built.
 * TODO SCRUM-117: replace with TanStack Query (GET /users + mutations); the return shape stays the same.
 */
import { useCallback, useState } from 'react'
import { SAMPLE_USERS } from '../model/users.sampleData'
import type { ManagedUser, UserStatus } from '../model/users.types'

export interface UserManagement {
  users: ManagedUser[]
  setStatus: (userId: string, status: UserStatus) => void
}

export function useUserManagement(initialUsers: ManagedUser[] = SAMPLE_USERS): UserManagement {
  const [users, setUsers] = useState(initialUsers)

  const setStatus = useCallback((userId: string, status: UserStatus) => {
    setUsers((list) => list.map((user) => (user.id === userId ? { ...user, status } : user)))
  }, [])

  return { users, setStatus }
}
