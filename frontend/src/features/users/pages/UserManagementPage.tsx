/** UserManagementPage — the administrator's list of consultation users (Figma: Admin / User list, F-05). */
import { useCallback, useState } from 'react'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog/ConfirmDeactivateDialog'
import { UserFormDrawer } from '../components/UserFormDrawer/UserFormDrawer'
import { UserTable } from '../components/UserTable/UserTable'
import { useUserManagement } from '../hooks/useUserManagement'
import { SAMPLE_SCOPE_TREE } from '../model/users.sampleData'
import type { ManagedUser } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'

/** Which form is open: `user: null` creates a new user, a user edits that one. */
type DrawerState = { user: ManagedUser | null } | null

export function UserManagementPage() {
  const { users, setStatus, createUser, updateUser, isEmailTaken } = useUserManagement()
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [userToDeactivate, setUserToDeactivate] = useState<ManagedUser | null>(null)
  const cancelDeactivation = useCallback(() => setUserToDeactivate(null), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const editedUser = drawer?.user ?? null

  // Deactivating asks first (Figma: Admin / Deactivate confirmation); reactivating is immediate (spec Q1).
  function toggleStatus(user: ManagedUser) {
    if (user.status === 'ACTIVE') setUserToDeactivate(user)
    else setStatus(user.id, 'ACTIVE')
  }

  function confirmDeactivation() {
    if (userToDeactivate) setStatus(userToDeactivate.id, 'INACTIVE')
    setUserToDeactivate(null)
  }

  function submitForm(values: UserFormValues) {
    if (editedUser) updateUser(editedUser.id, values)
    else createUser(values)
    setDrawer(null)
  }

  /** "Deactivate user" in the edit drawer: close the form, then ask for confirmation. */
  function deactivateFromDrawer(user: ManagedUser) {
    setDrawer(null)
    setUserToDeactivate(user)
  }

  return (
    <div className="p-4 md:p-6">
      <UserTable
        users={users}
        onCreate={() => setDrawer({ user: null })}
        onEdit={(user) => setDrawer({ user })}
        onToggleStatus={toggleStatus}
      />
      {drawer && (
        // TODO SCRUM-117: the network tree comes from the API.
        <UserFormDrawer
          key={editedUser?.id ?? 'new'}
          tree={SAMPLE_SCOPE_TREE}
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
    </div>
  )
}
