/** UserManagementPage — the administrator's list of consultation users (Figma: Admin / User list, F-05). */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/design-system/atoms'
import { Banner } from '@/design-system/molecules'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog/ConfirmDeactivateDialog'
import { TemporaryPasswordDialog } from '../components/TemporaryPasswordDialog/TemporaryPasswordDialog'
import { UserFormDrawer } from '../components/UserFormDrawer/UserFormDrawer'
import { UserTable } from '../components/UserTable/UserTable'
import { useUserManagement } from '../hooks/useUserManagement'
import type { ManagedUser, SaveUserResult, UserStatus } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'

/** Which form is open: `user: null` creates a new user, a user edits that one. */
type DrawerState = { user: ManagedUser | null } | null

/** Shown with the form values: the backend does not store the full name yet. */
interface CreatedUser {
  name: string
  email: string
  temporaryPassword: string
}

export function UserManagementPage() {
  const { t } = useTranslation('users')
  const { status, retry, users, tree, setStatus, createUser, updateUser, isEmailTaken } =
    useUserManagement()
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [userToDeactivate, setUserToDeactivate] = useState<ManagedUser | null>(null)
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null)
  /** Name of the user whose status could not be changed. */
  const [statusErrorName, setStatusErrorName] = useState<string | null>(null)
  const cancelDeactivation = useCallback(() => setUserToDeactivate(null), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const closePassword = useCallback(() => setCreatedUser(null), [])
  const editedUser = drawer?.user ?? null

  async function changeStatus(user: ManagedUser, next: UserStatus) {
    setStatusErrorName(null)
    if (!(await setStatus(user.id, next))) setStatusErrorName(user.name)
  }

  // Deactivating asks first (Figma: Admin / Deactivate confirmation); reactivating is immediate (spec Q1).
  function toggleStatus(user: ManagedUser) {
    if (user.status === 'ACTIVE') setUserToDeactivate(user)
    else void changeStatus(user, 'ACTIVE')
  }

  function confirmDeactivation() {
    if (userToDeactivate) void changeStatus(userToDeactivate, 'INACTIVE')
    setUserToDeactivate(null)
  }

  async function submitForm(values: UserFormValues): Promise<SaveUserResult> {
    if (editedUser) {
      const result = await updateUser(editedUser.id, values)
      if (result === 'saved') setDrawer(null)
      return result
    }
    const outcome = await createUser(values)
    if (outcome.result !== 'saved') return outcome.result
    setDrawer(null)
    setCreatedUser({
      name: values.name,
      email: outcome.user.email,
      temporaryPassword: outcome.temporaryPassword,
    })
    return 'saved'
  }

  /** "Deactivate user" in the edit drawer: close the form, then ask for confirmation. */
  function deactivateFromDrawer(user: ManagedUser) {
    setDrawer(null)
    setUserToDeactivate(user)
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center p-10">
        <Spinner label={t('page.loading')} className="text-action-link" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="p-4 md:p-6">
        <Banner
          kind="stale"
          message={t('page.loadError')}
          actionLabel={t('page.retry')}
          onAction={retry}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {statusErrorName && (
        <Banner kind="stale" message={t('page.statusError', { name: statusErrorName })} />
      )}
      <UserTable
        users={users}
        onCreate={() => setDrawer({ user: null })}
        onEdit={(user) => setDrawer({ user })}
        onToggleStatus={toggleStatus}
      />
      {drawer && (
        <UserFormDrawer
          key={editedUser?.id ?? 'new'}
          tree={tree}
          user={editedUser ?? undefined}
          isEmailTaken={(email) => isEmailTaken(email, editedUser?.id)}
          onSubmit={submitForm}
          onDeactivate={
            editedUser?.status === 'ACTIVE' ? () => deactivateFromDrawer(editedUser) : undefined
          }
          onClose={closeDrawer}
        />
      )}
      {userToDeactivate && (
        <ConfirmDeactivateDialog
          userName={userToDeactivate.name}
          onConfirm={confirmDeactivation}
          onCancel={cancelDeactivation}
        />
      )}
      {createdUser && (
        <TemporaryPasswordDialog
          userName={createdUser.name}
          email={createdUser.email}
          password={createdUser.temporaryPassword}
          onClose={closePassword}
        />
      )}
    </div>
  )
}
