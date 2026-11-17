/** TransformerCard molecule — a node's transformer as F-27 lists it: SMAC, status, voltages, battery, last record (Figma: Node Detail Panel → Transformer, M5 / M6). Laid out like the fuse rows: the device with its last record under it, then the phases, then the battery bar. */
import { useTranslation } from 'react-i18next'
import { Icon } from '@/design-system/atoms'
import { DataField } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/formatDateTime'
import { formatDecimal, formatPercent } from '../../model/nodeDetail.format'
import type { PhaseState, TransformerDetail } from '../../model/nodeDetail.types'

export interface TransformerCardProps {
  transformer: TransformerDetail
}

const PHASES = ['A', 'B', 'C'] as const

/** Below this the bar turns red: the default low-energy threshold (F-45). The panel does not receive the configured one. */
const LOW_BATTERY_PERCENT = 30

export function TransformerCard({ transformer }: TransformerCardProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const title = t('nodeDetail.transformer.title')
  const { a, b, c } = transformer.voltages
  const voltages = { A: a, B: b, C: c }
  const hasVoltage = a !== null || b !== null || c !== null
  const states = {
    A: transformer.phaseStates.a,
    B: transformer.phaseStates.b,
    C: transformer.phaseStates.c,
  }

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface-alt p-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
        <Icon name="transformer" size="sm" />
        {title}
      </h3>
      <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
        <dl className="grid grid-cols-2 gap-3">
          <DataField
            label={t('nodeDetail.transformer.device')}
            value={
              transformer.deviceId === null ? null : (
                <span className="flex flex-col">
                  {transformer.deviceId}
                  <span className="mt-0.5 text-micro font-normal text-text-secondary">
                    <span className="sr-only">{t('nodeDetail.transformer.lastRecord')}: </span>
                    {transformer.lastRecordAt === null
                      ? t('nodeDetail.noValue')
                      : formatDateTime(transformer.lastRecordAt, locale, 'short')}
                  </span>
                </span>
              )
            }
          />
          <DataField
            label={t('nodeDetail.transformer.status')}
            value={
              <span
                className={cn(
                  'font-semibold',
                  transformer.isInactive ? 'text-text-muted' : 'text-status-online'
                )}
              >
                {t(
                  transformer.isInactive
                    ? 'nodeDetail.transformer.inactive'
                    : 'nodeDetail.transformer.reporting'
                )}
              </span>
            }
          />
          <div className="col-span-2">
            <DataField
              label={t('nodeDetail.transformer.voltages')}
              value={
                hasVoltage ? (
                  <span className="grid grid-cols-3 gap-2">
                    {PHASES.map((phase) => (
                      <PhaseTile
                        key={phase}
                        phase={phase}
                        volts={voltages[phase]}
                        state={states[phase]}
                      />
                    ))}
                  </span>
                ) : null
              }
            />
          </div>
        </dl>
        <BatteryBar
          label={t('nodeDetail.transformer.battery')}
          percent={transformer.batteryPercent}
        />
      </div>
    </section>
  )
}

/** Green when the phase is fine, yellow out of range, red dropped: the same colors as the fuse rows. */
const PHASE_CHIP_CLASS: Record<PhaseState, string> = {
  NORMAL: 'bg-status-online text-text-inverse',
  OUT_OF_RANGE: 'bg-status-warning text-text-primary',
  DROPPED: 'bg-status-critical text-text-inverse',
}

const PHASE_LABEL_CLASS: Record<PhaseState, string> = {
  NORMAL: 'text-status-online',
  OUT_OF_RANGE: 'text-text-primary',
  DROPPED: 'text-status-critical',
}

interface PhaseTileProps {
  phase: (typeof PHASES)[number]
  volts: number | null
  state: PhaseState
}

/** One SMAC channel: its letter colored by state, its voltage and its state in words. A phase the transformer does not have shows a dash and no state. */
function PhaseTile({ phase, volts, state }: Readonly<PhaseTileProps>) {
  const { t, i18n } = useTranslation('dashboard')
  const exists = volts !== null
  return (
    <span
      className="flex flex-col gap-0.5"
      data-phase={phase}
      data-state={exists ? state : undefined}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-4.5 items-center justify-center rounded text-micro font-semibold',
            exists ? PHASE_CHIP_CLASS[state] : 'bg-bg-surface-alt text-text-secondary'
          )}
        >
          {phase}
        </span>
        <span className="sr-only">{phase}</span>
        {exists ? t('nodeDetail.volts', { value: formatDecimal(volts, i18n.language) }) : '—'}
      </span>
      {exists && (
        <span className={cn('text-micro font-semibold', PHASE_LABEL_CLASS[state])}>
          {t(`nodeDetail.transformer.phaseState.${state}`)}
        </span>
      )}
    </span>
  )
}

interface BatteryBarProps {
  label: string
  percent: number | null
}

/** Battery level as a bar, with the label on the left and the value on the right; without a reading, an empty track and a dash. */
function BatteryBar({ label, percent }: Readonly<BatteryBarProps>) {
  const { t, i18n } = useTranslation('dashboard')
  const level = percent === null ? null : Math.min(100, Math.max(0, percent))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-sm font-semibold text-text-heading">
          {percent === null ? t('nodeDetail.noValue') : formatPercent(percent, i18n.language)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-bg-surface-alt"
      >
        {level !== null && (
          <div
            className={cn(
              'h-full rounded-full',
              level < LOW_BATTERY_PERCENT ? 'bg-status-critical' : 'bg-status-online'
            )}
            style={{ width: `${level}%` }}
          />
        )}
      </div>
    </div>
  )
}
