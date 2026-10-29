/** FaultPanelToggle molecule — button over the map that opens the fault panel below the xl breakpoint. */
import { useTranslation } from 'react-i18next'
import { Icon } from '@/design-system/atoms'

export interface FaultPanelToggleProps {
  activeCount: number
  isOpen: boolean
  onOpen: () => void
}

export function FaultPanelToggle({ activeCount, isOpen, onOpen }: FaultPanelToggleProps) {
  const { t } = useTranslation('dashboard')

  return (
    <button
      type="button"
      aria-controls="fault-panel"
      aria-expanded={isOpen}
      onClick={onOpen}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-action-secondary px-4 text-sm font-semibold text-text-inverse shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus xl:hidden"
    >
      <Icon name="alert" size="sm" />
      {t('panel.openMobile', { count: activeCount })}
    </button>
  )
}
