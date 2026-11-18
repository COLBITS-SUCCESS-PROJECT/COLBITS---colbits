/** MapRefreshTime molecule — time of the last successful map refresh, shown on the map below the lg breakpoint (F-32). */
import { useTranslation } from 'react-i18next'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/formatDateTime'

export interface MapRefreshTimeProps {
  className?: string
}

/**
 * From lg up, the top bar shows this time next to the Live / Stale dot (Figma: Top Bar). Below lg the
 * top bar only has room for the dot and the refresh button, so the time is shown on the map instead.
 * Nothing is shown before the first successful refresh.
 */
export function MapRefreshTime({ className }: MapRefreshTimeProps) {
  const { t, i18n } = useTranslation('common')
  const lastSyncedAt = useDataFreshnessStore((state) => state.lastSyncedAt)

  if (lastSyncedAt === null) return null

  return (
    <p
      className={cn(
        'rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium whitespace-nowrap text-text-secondary shadow-card lg:hidden',
        className
      )}
    >
      {t('freshness.lastUpdate', { time: formatTime(new Date(lastSyncedAt), i18n.language) })}
    </p>
  )
}
