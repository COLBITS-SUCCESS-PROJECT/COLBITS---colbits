/** FaultList — list of fault cards with loading, error and empty states. */
import { useTranslation } from 'react-i18next'
import { Button, Skeleton } from '@/design-system/atoms'
import type { FaultAlert } from '../../model/liveMonitoring.types'
import { FaultListItem } from '../FaultListItem/FaultListItem'

const SKELETON_CARDS = 3

export interface FaultListProps {
  faults: FaultAlert[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function FaultList({ faults, isLoading, isError, onRetry }: FaultListProps) {
  const { t } = useTranslation('dashboard')

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={t('panel.loading')} className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} shape="rect" className="h-44" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-6 text-center"
      >
        <p className="text-sm text-text-secondary">{t('panel.error')}</p>
        <Button label={t('panel.retry')} variant="outline" iconLeft="refresh" onClick={onRetry} />
      </div>
    )
  }

  if (faults.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-text-subtle">
        {t('panel.empty')}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {faults.map((fault) => (
        <li key={fault.id}>
          <FaultListItem fault={fault} />
        </li>
      ))}
    </ul>
  )
}
