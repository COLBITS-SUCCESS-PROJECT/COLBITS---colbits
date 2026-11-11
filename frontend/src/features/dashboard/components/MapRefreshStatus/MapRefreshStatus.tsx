/** MapRefreshStatus — refresh state shown on the map: the last refresh time (F-32) and the warning when the map stops refreshing (F-31). */
import { useTranslation } from 'react-i18next'
import { Banner } from '@/design-system/molecules'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { MapRefreshTime } from '../MapRefreshTime/MapRefreshTime'

export interface MapRefreshStatusProps {
  /** Asks the map's nodes again (the warning's "Reintentar"). */
  onRetry: () => void
}

/**
 * Goes in the top overlay slot of MapCanvas, which stacks its children. Below lg the time comes first
 * and the warning under it; from lg the time is in the top bar and the warning is centered (Figma M10).
 */
export function MapRefreshStatus({ onRetry }: MapRefreshStatusProps) {
  const { t } = useTranslation('dashboard')
  const isInterrupted = useDataFreshnessStore((state) => state.isInterrupted)

  return (
    <>
      <MapRefreshTime />
      {isInterrupted && (
        <Banner
          kind="stale"
          message={t('map.interrupted')}
          actionLabel={t('map.retry')}
          onAction={onRetry}
          className="lg:self-center"
        />
      )}
    </>
  )
}
