/** ScopeFilterBar molecule — zone › substation › circuit › node selects, each narrowed by the ones before it (F-65). */
import { useTranslation } from 'react-i18next'
import { Select } from '@/design-system/molecules'
import { ALL } from '../../model/history.constants'
import type { ScopeFilter } from '../../model/history.types'
import type { ScopeOption, ScopeOptions } from '../../model/scopeOptions'

export interface ScopeFilterBarProps {
  scope: ScopeFilter
  options: ScopeOptions
  onChange: (level: keyof ScopeFilter, value: string) => void
}

interface LevelConfig {
  level: keyof ScopeFilter
  options: keyof ScopeOptions
  allKey: 'allZones' | 'allSubstations' | 'allCircuits' | 'allNodes'
}

const LEVELS: LevelConfig[] = [
  { level: 'zone', options: 'zones', allKey: 'allZones' },
  { level: 'substation', options: 'substations', allKey: 'allSubstations' },
  { level: 'circuit', options: 'circuits', allKey: 'allCircuits' },
  { level: 'node', options: 'nodes', allKey: 'allNodes' },
]

export function ScopeFilterBar({ scope, options, onChange }: ScopeFilterBarProps) {
  const { t } = useTranslation('analysis')
  const withAll = (allKey: LevelConfig['allKey'], entries: ScopeOption[]) => [
    { value: ALL, label: t(`filters.${allKey}`) },
    ...entries,
  ]

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:w-max xl:grid-cols-[repeat(4,12.5rem)]">
      {LEVELS.map(({ level, options: key, allKey }) => (
        <Select
          key={level}
          label={t(`filters.${level}`)}
          options={withAll(allKey, options[key])}
          value={scope[level]}
          onChange={(event) => onChange(level, event.target.value)}
        />
      ))}
    </div>
  )
}
