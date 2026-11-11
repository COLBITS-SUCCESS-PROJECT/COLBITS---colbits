/** UserManagementPage — the administrator's list of consultation users (Figma: Admin / User list, F-05). */
import { useCallback, useState } from 'react'
import { ConfirmDeactivateDialog } from '../components/ConfirmDeactivateDialog/ConfirmDeactivateDialog'
import { UserTable } from '../components/UserTable/UserTable'
import { useUserManagement } from '../hooks/useUserManagement'
import type { ManagedUser } from '../model/users.types'

export function UserManagementPage() {
  const { users, setStatus } = useUserManagement()
  const [userToDeactivate, setUserToDeactivate] = useState<ManagedUser | null>(null)
  const cancelDeactivation = useCallback(() => setUserToDeactivate(null), [])

  // Deactivating asks first (Figma: Admin / Deactivate confirmation); reactivating is immediate (spec Q1).
  function toggleStatus(user: ManagedUser) {
    if (user.status === 'ACTIVE') setUserToDeactivate(user)
    else setStatus(user.id, 'ACTIVE')
  }

  function confirmDeactivation() {
    if (userToDeactivate) setStatus(userToDeactivate.id, 'INACTIVE')
    setUserToDeactivate(null)
  }

  return (
    <div className="p-4 md:p-6">
      <UserTable users={users} onToggleStatus={toggleStatus} />
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
