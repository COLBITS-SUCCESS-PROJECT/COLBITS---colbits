/** ChartCard organism — white card with title, subtitle and a chart, or its loading / empty / error state (Figma: Chart Card). */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Skeleton } from '@/design-system/atoms'

export type ChartCardStatus = 'loading' | 'error' | 'empty' | 'ready' | 'unavailable'

export interface ChartCardProps {
  title: string
  subtitle: string
  status: ChartCardStatus
  onRetry: () => void
  children: ReactNode
}

export function ChartCard({ title, subtitle, status, onRetry, children }: ChartCardProps) {
  const { t } = useTranslation('analysis')

  return (
    <section
      aria-label={title}
      aria-busy={status === 'loading'}
      className="relative flex min-h-75 min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-bg-surface px-4.5 py-4"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-card-title font-semibold text-text-heading">{title}</h2>
        <p className="text-xs text-text-subtle">{subtitle}</p>
      </header>
      {status === 'ready' && children}
      {status === 'loading' && (
        <div className="flex flex-1 flex-col gap-3">
          <span className="sr-only">{t('state.loading')}</span>
          <Skeleton className="w-1/2" />
          <Skeleton shape="rect" className="min-h-40 flex-1" />
        </div>
      )}
      {(status === 'empty' || status === 'unavailable') && (
        <p className="flex flex-1 items-center justify-center text-center text-sm text-text-subtle">
          {t(status === 'unavailable' ? 'state.unavailable' : 'state.empty')}
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-center text-sm text-text-danger">{t('state.error')}</p>
          <Button label={t('state.retry')} variant="outline" onClick={onRetry} />
        </div>
      )}
    </section>
  )
}
