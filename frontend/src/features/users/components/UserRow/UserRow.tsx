/** UserRow molecule — one consultation user: identity, scope tags, status and actions (Figma: User Row). */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar, IconButton, StatusDot } from '@/design-system/atoms'
import { ScopeTag } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { MAX_VISIBLE_SCOPE_TAGS, SCOPE_LEVEL_ICON } from '../../model/users.constants'
import type { ManagedUser } from '../../model/users.types'

export interface UserRowProps {
  user: ManagedUser
  /** Omit to hide the edit button. */
  onEdit?: (user: ManagedUser) => void
  /** Power button: deactivates an active user, reactivates an inactive one. */
  onToggleStatus: (user: ManagedUser) => void
}

export function UserRow({ user, onEdit, onToggleStatus }: UserRowProps) {
  const { t } = useTranslation('users')
  const nameId = useId()
  const isActive = user.status === 'ACTIVE'
  const visibleScope = user.scope.slice(0, MAX_VISIBLE_SCOPE_TAGS)
  const hiddenCount = user.scope.length - visibleScope.length

  return (
    <li
      aria-labelledby={nameId}
      data-status={user.status}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border-default bg-bg-surface px-4 py-3.5',
        'md:min-h-25 md:flex-row md:items-center md:justify-between md:gap-4'
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-3 md:w-60', !isActive && 'opacity-60')}>
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p id={nameId} className="truncate text-sm font-semibold text-text-primary">
            {user.name}
          </p>
          <p className="truncate text-xs text-text-subtle">{user.email}</p>
        </div>
      </div>

      <ul
        aria-label={t('row.scope', { name: user.name })}
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5 md:w-90',
          !isActive && 'opacity-60'
        )}
      >
        {visibleScope.map((item) => (
          <li key={item.id}>
            <ScopeTag
              icon={SCOPE_LEVEL_ICON[item.level]}
              label={t('scopeTag', { level: t(`scopeLevel.${item.level}`), name: item.name })}
            />
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="text-xs font-medium text-text-subtle">
            {t('row.moreScope', { count: hiddenCount })}
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-4 md:contents">
        <p
          className={cn(
            'flex items-center gap-1.5 text-label font-medium md:w-22.5',
            isActive ? 'text-feedback-success-text' : 'text-text-subtle'
          )}
        >
          <StatusDot status={isActive ? 'online' : 'offline'} />
          {t(`status.${user.status}`)}
        </p>

        <div className="flex shrink-0 gap-2">
          {onEdit && (
            <IconButton
              icon="edit"
              label={t('row.edit', { name: user.name })}
              onClick={() => onEdit(user)}
            />
          )}
          <IconButton
            icon="power"
            tone={isActive ? 'danger' : 'default'}
            label={t(isActive ? 'row.deactivate' : 'row.reactivate', { name: user.name })}
            onClick={() => onToggleStatus(user)}
          />
        </div>
      </div>
    </li>
  )
}
