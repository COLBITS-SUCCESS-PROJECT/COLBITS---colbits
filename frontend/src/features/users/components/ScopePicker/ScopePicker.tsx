/** ScopePicker organism — searchable network tree to assign a user's data scope (Figma: User Form Drawer → Data scope, F-08). */
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScopeTag, ScopeTreeRow, SearchField } from '@/design-system/molecules'
import { SCOPE_LEVEL_DEPTH, SCOPE_LEVEL_ICON } from '../../model/users.constants'
import {
  getCheckState,
  partiallyCheckedIds,
  scopeToSelection,
  selectionToScope,
  toggleScopeNode,
  visibleScopeRows,
} from '../../model/scopeTree'
import type { ScopeItem, ScopeNode } from '../../model/users.types'

export interface ScopePickerProps {
  tree: ScopeNode[]
  value: ScopeItem[]
  onChange: (scope: ScopeItem[]) => void
  /** Translated validation message (e.g. nothing selected). */
  error?: string
}

export function ScopePicker({ tree, value, onChange, error }: ScopePickerProps) {
  const { t } = useTranslation('users')
  const titleId = useId()
  const errorId = useId()
  const [search, setSearch] = useState('')
  const selected = useMemo(() => scopeToSelection(tree, value), [tree, value])
  // Opens the path to what is already assigned; later the administrator opens and closes rows.
  const [expanded, setExpanded] = useState(() => partiallyCheckedIds(tree, selected))
  const rows = visibleScopeRows(tree, selected, expanded, search)

  const levelName = (node: ScopeItem | ScopeNode) =>
    t('scopeTag', { level: t(`scopeLevel.${node.level}`), name: node.name })

  function rowLabel(node: ScopeNode) {
    if (!node.description) return levelName(node)
    const level = t(`scopeLevel.${node.level}`)
    return t('scope.rowWithDescription', { level, name: node.name, description: node.description })
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="text-center text-base font-semibold text-text-heading">
        {t('scope.title')}
      </h3>
      <p className="text-xs text-text-subtle">{t('scope.description')}</p>
      <SearchField
        label={t('scope.search')}
        placeholder={t('scope.searchPlaceholder')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div
        role="group"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="flex flex-col gap-1 py-1.5"
      >
        {rows.map(({ node, isExpanded, isCovered }) => {
          const state = getCheckState(node, selected, isCovered)
          const name = levelName(node)
          return (
            <ScopeTreeRow
              key={node.id}
              label={rowLabel(node)}
              icon={SCOPE_LEVEL_ICON[node.level]}
              level={SCOPE_LEVEL_DEPTH[node.level]}
              isChecked={state === 'checked'}
              isIndeterminate={state === 'partial'}
              isDisabled={isCovered}
              meta={
                node.level === 'DEVICE'
                  ? undefined
                  : t('scope.devices', { count: node.deviceCount })
              }
              expand={
                node.children.length > 0 && !search
                  ? {
                      isExpanded,
                      onToggle: () => toggleExpanded(node.id),
                      label: t(isExpanded ? 'scope.collapse' : 'scope.expand', { name }),
                    }
                  : undefined
              }
              onToggle={(checked) =>
                onChange(selectionToScope(tree, toggleScopeNode(tree, selected, node.id, checked)))
              }
            />
          )
        })}
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-text-secondary">{t('scope.noMatches')}</p>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-text-danger">
          {error}
        </p>
      )}

      <h4 className="text-center text-label font-semibold text-text-heading">
        {t('scope.selected', { count: value.length })}
      </h4>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => (
            <li key={item.id}>
              <ScopeTag icon={SCOPE_LEVEL_ICON[item.level]} label={levelName(item)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-xs text-text-subtle">{t('scope.noneSelected')}</p>
      )}
    </section>
  )
}
