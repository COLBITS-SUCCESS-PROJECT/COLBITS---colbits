/** ChannelChips molecule — SMAC channel squares (A · B · C) plus the transformer's phase type, drawn like PhaseChips. */
import { useTranslation } from 'react-i18next'
import { cn } from '@/utils/cn'
import type { PhaseClassification } from '../../model/liveMonitoring.types'

export type SmacChannel = 'A' | 'B' | 'C'

/**
 * Phase count of a transformer from its identifier (Annex §3.3: node + transformer id + phase count,
 * e.g. 0000300008-T1-3). null when the identifier does not end in 2 or 3.
 */
function transformerClassification(sourceId: string | null): PhaseClassification | null {
  const match = sourceId ? /-([23])$/.exec(sourceId) : null
  if (!match) return null
  return match[1] === '2' ? 'BIPHASIC' : 'TRIPHASIC'
}

/** Phase type from the identifier's phase count (Annex §3.3); a pair of channels alone also says it. */
function classificationOf(
  sourceId: string | null,
  channels: SmacChannel[] | null
): PhaseClassification | null {
  const fromIdentifier = transformerClassification(sourceId)
  if (fromIdentifier) return fromIdentifier
  if (channels?.length === 2) return 'BIPHASIC'
  return channels?.length === 3 ? 'TRIPHASIC' : null
}

export interface ChannelChipsProps {
  /** The channel the alarm is about: drawn red. */
  channel: SmacChannel
  /** Channels the transformer has, as the service sends them (A-B-C, A-B, B-C or A-C); null when unknown: only `channel` is drawn. */
  channels: SmacChannel[] | null
  /** Transformer identifier, where its phase count comes from. */
  sourceId: string | null
}

export function ChannelChips({ channel, channels, sourceId }: ChannelChipsProps) {
  const { t } = useTranslation('dashboard')
  const classification = classificationOf(sourceId, channels)
  // The channel that dropped is always drawn, even if the list does not include it.
  const drawn = channels?.includes(channel) ? channels : [channel]

  return (
    <span className="flex items-center gap-0.75">
      {drawn.map((letter) => {
        const state = letter === channel ? 'CRITICAL' : 'OK'
        return (
          <span
            key={letter}
            role="img"
            aria-label={t('fault.channelState', {
              channel: letter,
              state: t(`fault.phaseState.${state}`),
            })}
            data-state={state}
            className={cn(
              'flex size-4.5 items-center justify-center rounded border text-micro font-semibold',
              state === 'CRITICAL'
                ? 'border-status-critical bg-status-critical text-text-inverse'
                : 'border-border-default text-text-muted'
            )}
          >
            <span aria-hidden="true">{letter}</span>
          </span>
        )
      })}
      {classification && (
        <span className="ml-0.5 text-xs text-text-primary">
          {t(`classification.${classification}`)}
        </span>
      )}
    </span>
  )
}
