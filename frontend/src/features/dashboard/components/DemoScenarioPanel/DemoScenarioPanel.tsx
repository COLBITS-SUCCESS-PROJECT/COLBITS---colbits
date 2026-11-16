/** DemoScenarioPanel organism — runs demo scenarios on the selected node, for the administrator in demo mode only (US31 · F-100, NF-03). */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SelectOption } from '@/design-system/molecules'
import { useAuthStore } from '@/stores/auth.store'
import { formatTime } from '@/utils/formatDateTime'
import { useRunScenarioMutation } from '../../hooks/useRunScenarioMutation'
import { useScenariosQuery } from '../../hooks/useScenariosQuery'
import { formatDecimal } from '../../model/nodeDetail.format'
import type { FuseDetail, NodeDetail, TransformerDetail } from '../../model/nodeDetail.types'
import {
  SCENARIO_CHANNELS,
  actionsFor,
  channelsOf,
  scenarioFailureOf,
  scenarioFuses,
  scenarioTransformers,
  voltsOf,
} from '../../model/scenarios.rules'
import type { ScenarioAction, ScenarioChannel, ScenarioResult } from '../../model/scenarios.types'
import { ScenarioActionGroup, type ScenarioButton } from './ScenarioActionGroup'

export interface DemoScenarioPanelProps {
  detail: NodeDetail
}

/** Renders nothing unless the user is the administrator and the backend runs in demo mode (NF-03). */
export function DemoScenarioPanel({ detail }: DemoScenarioPanelProps) {
  const isAdmin = useAuthStore((state) => state.user?.role === 'ADMIN')
  const catalog = useScenariosQuery(isAdmin)

  if (!isAdmin || !catalog.data?.enabled) return null
  return <ScenarioControls detail={detail} actions={catalog.data.actions} />
}

function toChannel(value: string): ScenarioChannel | null {
  return SCENARIO_CHANNELS.find((channel) => channel === value) ?? null
}

function voltageKeyOf(hasVoltage: boolean | null): string {
  if (hasVoltage === null) return 'scenarios.voltage.unknown'
  return hasVoltage ? 'scenarios.voltage.present' : 'scenarios.voltage.absent'
}

interface ScenarioControlsProps {
  detail: NodeDetail
  actions: ScenarioAction[]
}

function ScenarioControls({ detail, actions }: ScenarioControlsProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const mutation = useRunScenarioMutation()
  const fuses = scenarioFuses(detail)
  const transformers = scenarioTransformers(detail)
  const [fuseId, setFuseId] = useState(fuses[0]?.id ?? '')
  const [transformerId, setTransformerId] = useState(transformers[0]?.id ?? '')
  const [chosenChannel, setChosenChannel] = useState<ScenarioChannel | null>(null)

  // The detail refreshes every 15 s: the choice is kept by id and falls back to the first item.
  const fuse = fuses.find((item) => item.id === fuseId) ?? fuses[0]
  const transformer = transformers.find((item) => item.id === transformerId) ?? transformers[0]
  const channels = transformer ? channelsOf(transformer) : []
  const channel =
    chosenChannel !== null && channels.includes(chosenChannel)
      ? chosenChannel
      : (channels[0] ?? null)
  const fuseActions = fuse ? actionsFor(actions, 'FUSE') : []
  const transformerActions = transformer ? actionsFor(actions, 'TRANSFORMER') : []
  const runningAction = mutation.isPending ? (mutation.variables?.action ?? null) : null

  /** A backend action without a label yet keeps its code, so it works before the frontend names it. */
  const labelOr = (key: string, fallback: string, values?: Record<string, string | null>) =>
    i18n.exists(key, { ns: 'dashboard' }) ? t(key, values) : fallback

  function toButton(action: ScenarioAction, target: string): ScenarioButton {
    const label = labelOr(`scenarios.action.${action.code}`, action.code)
    return {
      code: action.code,
      label,
      hint: label === action.code ? action.effect : undefined,
      isDisabled: action.needsChannel && channel === null,
      onRun: () =>
        mutation.mutate({
          action: action.code,
          target,
          channel: action.needsChannel ? channel : null,
        }),
    }
  }

  const fuseOption = (item: FuseDetail): SelectOption => ({
    value: item.id,
    label: t('scenarios.fuseOption', {
      id: item.id,
      state: t(`nodeDetail.fuseState.${item.state}`),
      voltage: t(voltageKeyOf(item.hasVoltage)),
    }),
  })

  const channelOption = (item: TransformerDetail, phase: ScenarioChannel): SelectOption => {
    const volts = voltsOf(item, phase)
    return {
      value: phase,
      label:
        volts === null
          ? t('scenarios.channelOptionNoReading', { channel: phase })
          : t('scenarios.channelOption', { channel: phase, volts: formatDecimal(volts, locale) }),
    }
  }

  const doneMessage = (result: ScenarioResult) =>
    t('scenarios.done', {
      result: labelOr(
        `scenarios.result.${result.action}`,
        t('scenarios.resultFallback', { code: result.action }),
        { channel: result.channel }
      ),
      target: result.target,
      time: formatTime(result.recordedAt, locale),
    })

  return (
    <section aria-label={t('scenarios.title')} className="flex flex-col gap-3">
      <h3 className="border-b-2 border-action-primary pb-1 text-sm font-semibold text-text-heading">
        {t('scenarios.title')}
      </h3>
      <p className="text-xs text-text-secondary">{t('scenarios.note')}</p>
      {fuse && fuseActions.length > 0 && (
        <ScenarioActionGroup
          title={t('scenarios.fuses')}
          icon="fuse"
          target={{
            label: t('scenarios.fuse'),
            options: fuses.map(fuseOption),
            value: fuse.id,
            onChange: setFuseId,
          }}
          actions={fuseActions.map((action) => toButton(action, fuse.id))}
          runningAction={runningAction}
        />
      )}
      {transformer && transformerActions.length > 0 && (
        <ScenarioActionGroup
          title={t('scenarios.transformer')}
          icon="transformer"
          target={{
            label: t('scenarios.transformerId'),
            options: transformers.map((item) => ({ value: item.id, label: item.id })),
            value: transformer.id,
            onChange: setTransformerId,
          }}
          channel={
            transformerActions.some((action) => action.needsChannel)
              ? {
                  label: t('scenarios.channel'),
                  options: channels.map((phase) => channelOption(transformer, phase)),
                  value: channel ?? '',
                  onChange: (value) => setChosenChannel(toChannel(value)),
                }
              : undefined
          }
          actions={transformerActions.map((action) => toButton(action, transformer.id))}
          runningAction={runningAction}
        />
      )}
      {fuseActions.length === 0 && transformerActions.length === 0 && (
        <p className="text-sm text-text-secondary">{t('scenarios.empty')}</p>
      )}
      <p role="status" className="text-sm text-text-primary">
        {mutation.isSuccess ? doneMessage(mutation.data) : ''}
      </p>
      {mutation.isError && (
        <p role="alert" className="text-sm font-semibold text-status-critical">
          {t(`scenarios.failure.${scenarioFailureOf(mutation.error)}`, {
            target: mutation.variables?.target ?? '',
          })}
        </p>
      )}
    </section>
  )
}
