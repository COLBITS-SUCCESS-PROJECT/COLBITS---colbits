/** UserManagementPage — the administrator's list of consultation users (Figma: Admin / User list, F-05). */
import { useCallback, useState } from 'react'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog/ConfirmDeactivateDialog'
import { UserFormDrawer } from '../components/UserFormDrawer/UserFormDrawer'
import { UserTable } from '../components/UserTable/UserTable'
import { useUserManagement } from '../hooks/useUserManagement'
import { SAMPLE_SCOPE_TREE } from '../model/users.sampleData'
import type { ManagedUser } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'

export function UserManagementPage() {
  const { users, setStatus, createUser, isEmailTaken } = useUserManagement()
  const [isCreating, setIsCreating] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<ManagedUser | null>(null)
  const cancelDeactivation = useCallback(() => setUserToDeactivate(null), [])
  const closeDrawer = useCallback(() => setIsCreating(false), [])

  // Deactivating asks first (Figma: Admin / Deactivate confirmation); reactivating is immediate (spec Q1).
  function toggleStatus(user: ManagedUser) {
    if (user.status === 'ACTIVE') setUserToDeactivate(user)
    else setStatus(user.id, 'ACTIVE')
  }

  function confirmDeactivation() {
    if (userToDeactivate) setStatus(userToDeactivate.id, 'INACTIVE')
    setUserToDeactivate(null)
  }

  function submitNewUser(values: UserFormValues) {
    createUser(values)
    setIsCreating(false)
  }

  return (
    <div className="p-4 md:p-6">
      <UserTable users={users} onCreate={() => setIsCreating(true)} onToggleStatus={toggleStatus} />
      {isCreating && (
        // TODO SCRUM-117: the network tree comes from the API.
        <UserFormDrawer
          tree={SAMPLE_SCOPE_TREE}
          isEmailTaken={isEmailTaken}
          onSubmit={submitNewUser}
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
