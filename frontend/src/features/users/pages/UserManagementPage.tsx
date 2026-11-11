/** UserManagementPage — the administrator's list of consultation users (Figma: Admin / User list, F-05). */
import { UserTable } from '../components/UserTable/UserTable'
import { useUserManagement } from '../hooks/useUserManagement'
import type { ManagedUser } from '../model/users.types'

export function UserManagementPage() {
  const { users, setStatus } = useUserManagement()

  function toggleStatus(user: ManagedUser) {
    setStatus(user.id, user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
  }

  return (
    <div className="p-4 md:p-6">
      <UserTable users={users} onToggleStatus={toggleStatus} />
    </div>
  )
}
