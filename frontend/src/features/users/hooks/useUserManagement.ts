/**
 * In-memory list of consultation users and the actions on it, while the user endpoints are built.
 * TODO SCRUM-117: replace with TanStack Query (GET /users + mutations); the return shape stays the same.
 */
import { useCallback, useState } from 'react'
import { normalizeSearch } from '../model/normalizeSearch'
import { SAMPLE_USERS } from '../model/users.sampleData'
import type { ManagedUser, UserStatus } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'

export interface UserManagement {
  users: ManagedUser[]
  setStatus: (userId: string, status: UserStatus) => void
  /** F-07: a new consultation user starts active with the scope given in the form. */
  createUser: (values: UserFormValues) => void
  /** True when a user other than `exceptUserId` already has this email. */
  isEmailTaken: (email: string, exceptUserId?: string) => boolean
}

export function useUserManagement(initialUsers: ManagedUser[] = SAMPLE_USERS): UserManagement {
  const [users, setUsers] = useState(initialUsers)

  const setStatus = useCallback((userId: string, status: UserStatus) => {
    setUsers((list) => list.map((user) => (user.id === userId ? { ...user, status } : user)))
  }, [])

  const createUser = useCallback((values: UserFormValues) => {
    setUsers((list) => [...list, { id: crypto.randomUUID(), status: 'ACTIVE', ...values }])
  }, [])

  const isEmailTaken = useCallback(
    (email: string, exceptUserId?: string) =>
      users.some(
        (user) => user.id !== exceptUserId && normalizeSearch(user.email) === normalizeSearch(email)
      ),
    [users]
  )

  return { users, setStatus, createUser, isEmailTaken }
}
