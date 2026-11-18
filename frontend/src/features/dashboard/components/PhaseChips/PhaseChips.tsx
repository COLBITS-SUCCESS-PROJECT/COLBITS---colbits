/** PhaseChips molecule — canonical R · S · T phase squares plus classification (Figma: Fault List Item → Phases). */
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import type { PhaseClassification, PhaseState, PhaseStates } from '../../model/liveMonitoring.types'

const PHASE_ORDER: (keyof PhaseStates)[] = ['R', 'S', 'T']

const CHIP_CLASS: Record<PhaseState, string> = {
  CRITICAL: 'border-status-critical bg-status-critical text-text-inverse',
  WARNING: 'border-status-warning bg-status-warning text-text-primary',
  OK: 'border-border-default text-text-muted',
}

export interface PhaseChipsProps {
  phases: PhaseStates
  /** As computed by the backend (F-49); not shown when null. */
  classification: PhaseClassification | null
}

export function PhaseChips({ phases, classification }: PhaseChipsProps) {
  const { t } = useTranslation('dashboard')

  return (
    <span className="flex items-center gap-0.75">
      {PHASE_ORDER.map((phase) => (
        <span
          key={phase}
          role="img"
          aria-label={t('fault.phase', {
            phase: t(`fault.phaseLetter.${phase}`),
            state: t(`fault.phaseState.${phases[phase]}`),
          })}
          data-state={phases[phase]}
          className={cn(
            'flex size-4.5 items-center justify-center rounded border text-micro font-semibold',
            CHIP_CLASS[phases[phase]]
          )}
        >
          <span aria-hidden="true">{t(`fault.phaseLetter.${phase}`)}</span>
        </span>
      ))}
      {classification && (
        <span className="ml-0.5 text-xs text-text-primary">
          {t(`classification.${classification}`)}
        </span>
      )}
    </span>
  )
}
