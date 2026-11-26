/** ChartCard organism — white card with title, subtitle and a chart, or its loading / empty / error state (Figma: Chart Card). */
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Skeleton } from '@/design-system/atoms'

export type ChartCardStatus = 'loading' | 'error' | 'empty' | 'ready' | 'unavailable'

export interface ChartCardProps {
  title: string
  subtitle: string
  status: ChartCardStatus
  onRetry: () => void
  /** Replaces the default empty-state text, e.g. when a filter left nothing to show. */
  emptyText?: string
  children: ReactNode | ((expanded: boolean) => ReactNode)
}

export function ChartCard({
  title,
  subtitle,
  status,
  onRetry,
  emptyText,
  children,
}: ChartCardProps) {
  const { t } = useTranslation('analysis')

  const dialog = useRef<HTMLDialogElement>(null)
  const [expanded, setExpanded] = useState(false)
  const content = (large: boolean) => (typeof children === 'function' ? children(large) : children)

  return (
    <section
      aria-label={title}
      aria-busy={status === 'loading'}
      className="relative flex min-h-75 min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-bg-surface px-4.5 py-4"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-card-title font-semibold text-text-heading">{title}</h2>
          <p className="text-xs text-text-subtle">{subtitle}</p>
        </div>
        {status === 'ready' && (
          <Button
            variant="ghost"
            label={t('chart.expand')}
            aria-label={t('chart.expandNamed', { title })}
            aria-haspopup="dialog"
            onClick={() => {
              dialog.current?.showModal()
              setExpanded(true)
            }}
          />
        )}
      </header>
      <dialog
        ref={dialog}
        aria-label={title}
        onClose={() => setExpanded(false)}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[min(64rem,94vw)] overflow-auto rounded-xl border border-border-default bg-bg-surface p-4 text-text-primary backdrop:bg-black/45 sm:p-6"
      >
        {expanded && (
          <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="text-sm text-text-secondary">{subtitle}</p>
              </div>
              <Button
                variant="outline"
                label={t('chart.close')}
                onClick={() => dialog.current?.close()}
              />
            </header>
            {content(true)}
          </div>
        )}
      </dialog>
      {status === 'ready' && content(false)}
      {status === 'loading' && (
        <div className="flex flex-1 flex-col gap-3">
          <span className="sr-only">{t('state.loading')}</span>
          <Skeleton className="w-1/2" />
          <Skeleton shape="rect" className="min-h-40 flex-1" />
        </div>
      )}
      {(status === 'empty' || status === 'unavailable') && (
        <p className="flex flex-1 items-center justify-center text-center text-sm text-text-subtle">
          {status === 'unavailable' ? t('state.unavailable') : (emptyText ?? t('state.empty'))}
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
