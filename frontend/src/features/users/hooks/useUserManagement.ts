/**
 * Consultation users, the network tree of the scope picker, and the actions on them (US19 · F-05,
 * F-07, F-08), against GET/POST/PATCH /users and GET /nodes.
 */
import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/services/http/httpClient'
import { createUser, fetchScopeTree, fetchUsers, setUserStatus, updateUser } from '../api/users.api'
import { normalizeSearch } from '../model/normalizeSearch'
import { withScopeNames } from '../model/scopeTree'
import { generateTemporaryPassword } from '../model/temporaryPassword'
import type { ManagedUser, SaveUserResult, ScopeNode, UserStatus } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'

export const USERS_QUERY_KEY = ['users'] as const
export const SCOPE_TREE_QUERY_KEY = ['scope-tree'] as const

export type CreateUserResult =
  | { result: 'saved'; user: ManagedUser; temporaryPassword: string }
  | { result: 'emailTaken' | 'failed' }

export type UserManagementStatus = 'loading' | 'error' | 'ready'

export interface UserManagement {
  status: UserManagementStatus
  /** Asks the users and the network again after a load error. */
  retry: () => void
  users: ManagedUser[]
  tree: ScopeNode[]
  /** F-05: true when the backend saved the new status. The user keeps their scope (spec Q1). */
  setStatus: (userId: string, status: UserStatus) => Promise<boolean>
  /** F-07: a new active consultation user with the scope given in the form. */
  createUser: (values: UserFormValues) => Promise<CreateUserResult>
  /** F-05, F-08: changes name, email and scope; the status is kept. */
  updateUser: (userId: string, values: UserFormValues) => Promise<SaveUserResult>
  /** True when a listed user other than `exceptUserId` already has this email. */
  isEmailTaken: (email: string, exceptUserId?: string) => boolean
}

const isConflict = (error: unknown) => error instanceof ApiError && error.isConflict()

export function useUserManagement(): UserManagement {
  const queryClient = useQueryClient()
  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: ({ signal }) => fetchUsers(signal),
  })
  const treeQuery = useQuery({
    queryKey: SCOPE_TREE_QUERY_KEY,
    queryFn: ({ signal }) => fetchScopeTree(signal),
  })

  const tree = useMemo(() => treeQuery.data ?? [], [treeQuery.data])
  const users = useMemo(() => withScopeNames(usersQuery.data ?? [], tree), [usersQuery.data, tree])

  /** Shows the saved user at once, then asks the list again in case someone else changed it. */
  const showSaved = useCallback(
    (saved: ManagedUser) => {
      queryClient.setQueryData<ManagedUser[]>(USERS_QUERY_KEY, (list = []) =>
        list.some((user) => user.id === saved.id)
          ? list.map((user) => (user.id === saved.id ? saved : user))
          : [...list, saved]
      )
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
    },
    [queryClient]
  )

  const { mutateAsync: saveStatus } = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      setUserStatus(userId, status),
    onSuccess: showSaved,
  })
  const { mutateAsync: saveNewUser } = useMutation({
    mutationFn: ({ values, password }: { values: UserFormValues; password: string }) =>
      createUser(values, password),
    onSuccess: showSaved,
  })
  const { mutateAsync: saveUser } = useMutation({
    mutationFn: ({ userId, values }: { userId: string; values: UserFormValues }) =>
      updateUser(userId, values),
    onSuccess: showSaved,
  })

  const setStatus = useCallback(
    (userId: string, status: UserStatus) =>
      saveStatus({ userId, status }).then(
        () => true,
        () => false
      ),
    [saveStatus]
  )

  const create = useCallback(
    async (values: UserFormValues): Promise<CreateUserResult> => {
      // TEMPORARY until the backend generates the password and emails a link (spec Q3).
      const temporaryPassword = generateTemporaryPassword()
      try {
        const user = await saveNewUser({ values, password: temporaryPassword })
        return { result: 'saved', user, temporaryPassword }
      } catch (error) {
        return { result: isConflict(error) ? 'emailTaken' : 'failed' }
      }
    },
    [saveNewUser]
  )

  const update = useCallback(
    async (userId: string, values: UserFormValues): Promise<SaveUserResult> => {
      try {
        await saveUser({ userId, values })
        return 'saved'
      } catch (error) {
        return isConflict(error) ? 'emailTaken' : 'failed'
      }
    },
    [saveUser]
  )

  const isEmailTaken = useCallback(
    (email: string, exceptUserId?: string) =>
      users.some(
        (user) => user.id !== exceptUserId && normalizeSearch(user.email) === normalizeSearch(email)
      ),
    [users]
  )

  const { refetch: refetchUsers } = usersQuery
  const { refetch: refetchTree } = treeQuery
  const retry = useCallback(() => {
    void refetchUsers()
    void refetchTree()
  }, [refetchUsers, refetchTree])

  // Data already shown stays on screen if a later refresh fails.
  let status: UserManagementStatus = 'loading'
  if (usersQuery.data !== undefined && treeQuery.data !== undefined) status = 'ready'
  else if (usersQuery.isError || treeQuery.isError) status = 'error'

  return {
    status,
    retry,
    users,
    tree,
    setStatus,
    createUser: create,
    updateUser: update,
    isEmailTaken,
  }
}
