/** UserTable organism — card with the consultation users, search and status filter (Figma: User Table). */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/design-system/atoms'
import { SearchField, Select } from '@/design-system/molecules'
import { INITIAL_USER_FILTERS, USER_STATUS_FILTERS } from '../../model/users.constants'
import { filterUsers } from '../../model/userFilters'
import type { ManagedUser, UserFilters, UserStatusFilter } from '../../model/users.types'
import { UserRow } from '../UserRow/UserRow'

export interface UserTableProps {
  users: ManagedUser[]
  /** Omit to hide the "New user" button. */
  onCreate?: () => void
  onEdit?: (user: ManagedUser) => void
  onToggleStatus: (user: ManagedUser) => void
}

export function UserTable({ users, onCreate, onEdit, onToggleStatus }: UserTableProps) {
  const { t } = useTranslation('users')
  const [filters, setFilters] = useState<UserFilters>(INITIAL_USER_FILTERS)
  const visibleUsers = useMemo(() => filterUsers(users, filters), [users, filters])
  const statusOptions = USER_STATUS_FILTERS.map((value) => ({
    value,
    label: t(`status.${value}`),
  }))

  return (
    <section
      aria-labelledby="user-table-title"
      className="flex flex-col gap-3.5 rounded-xl border border-border-default bg-bg-surface px-4 py-4.5 md:px-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="user-table-title" className="text-lg font-semibold text-text-heading">
            {t('table.title')}
          </h2>
          <p className="text-xs text-text-subtle">{t('table.subtitle')}</p>
        </div>
        {onCreate && <Button label={t('table.newUser')} iconLeft="plus" onClick={onCreate} />}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end md:self-center">
        <SearchField
          label={t('table.search')}
          placeholder={t('table.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          className="sm:w-80"
        />
        <Select
          label={t('table.statusFilter')}
          options={statusOptions}
          value={filters.status}
          onChange={(event) =>
            setFilters({ ...filters, status: event.target.value as UserStatusFilter })
          }
          className="sm:w-50"
        />
      </div>

      {visibleUsers.length > 0 ? (
        <ul aria-labelledby="user-table-title" className="flex flex-col gap-3">
          {visibleUsers.map((user) => (
            <UserRow key={user.id} user={user} onEdit={onEdit} onToggleStatus={onToggleStatus} />
          ))}
        </ul>
      ) : (
        <p role="status" className="py-10 text-center text-sm text-text-secondary">
          {t(users.length === 0 ? 'table.empty' : 'table.noResults')}
        </p>
      )}
    </section>
  )
}
