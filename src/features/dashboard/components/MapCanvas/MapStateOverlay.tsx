/** MapStateOverlay — loading, empty and error messages shown over the map. */
import { useTranslation } from 'react-i18next'
import { Button, Spinner } from '@/design-system/atoms'

export type MapState = 'loading' | 'empty' | 'error'

export interface MapStateOverlayProps {
  state: MapState
  onRetry: () => void
}

export function MapStateOverlay({ state, onRetry }: MapStateOverlayProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div
        role={state === 'error' ? 'alert' : 'status'}
        className="pointer-events-auto flex flex-col items-center gap-3 rounded-card border border-border-default bg-bg-surface px-6 py-5 text-center shadow-card"
      >
        {state === 'loading' && <Spinner label={t('map.loading')} className="text-action-link" />}
        <p className="text-sm text-text-secondary">{t(`map.${state}`)}</p>
        {state === 'error' && (
          <Button label={t('map.retry')} variant="outline" iconLeft="refresh" onClick={onRetry} />
        )}
      </div>
    </div>
  )
}
