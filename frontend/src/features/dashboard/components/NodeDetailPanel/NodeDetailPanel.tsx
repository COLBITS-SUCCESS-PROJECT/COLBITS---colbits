/** NodeDetailPanel organism — live status of the selected node over the map, limited to what F-27 lists (Figma: Node Detail Panel, M4–M6). */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon, IconButton, Skeleton } from '@/design-system/atoms'
import { ApiError } from '@/services/http/httpClient'
import { cn } from '@/utils/cn'
import { useNodeDetailQuery } from '../../hooks/useNodeDetailQuery'
import type { NodeDetail } from '../../model/nodeDetail.types'
import { FuseSetCard } from '../FuseSetCard/FuseSetCard'
import { TransformerCard } from '../TransformerCard/TransformerCard'

export interface NodeDetailPanelProps {
  nodeId: string
  onClose: () => void
  className?: string
}

const SKELETON_ROWS = 4

/** Over the map: bottom sheet on phones, a side panel from md, left of the fault panel on xl (360 px). */
const PLACEMENT =
  'absolute inset-x-0 bottom-0 z-30 max-h-[85%] rounded-t-xl md:inset-x-auto md:top-3 md:right-3 md:bottom-3 md:max-h-none md:w-105 md:rounded-xl xl:right-[calc(22.5rem+0.75rem)]'

export function NodeDetailPanel({ nodeId, onClose, className }: NodeDetailPanelProps) {
  const { t } = useTranslation('dashboard')
  const query = useNodeDetailQuery(nodeId)
  const panelRef = useRef<HTMLElement>(null)

  // Focus moves to the panel itself (not to a button, so the Enter that opened it cannot press it),
  // when it opens or shows another node; screen readers then announce the node.
  useEffect(() => panelRef.current?.focus(), [nodeId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const detail = query.data
  const isNotFound = query.error instanceof ApiError && query.error.isNotFound()

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label={t('nodeDetail.label', { id: nodeId })}
      className={cn(
        'flex flex-col gap-3 overflow-y-auto border border-border-default bg-bg-surface p-4 shadow-card focus-visible:outline-2 focus-visible:outline-border-focus',
        PLACEMENT,
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-all text-text-heading">{nodeId}</h2>
          {detail && (
            <p className="text-xs text-text-secondary">
              {t('nodeDetail.location', {
                circuit: detail.circuit.name,
                substation: detail.substation.name,
              })}
            </p>
          )}
        </div>
        <IconButton icon="close" label={t('nodeDetail.close')} onClick={onClose} />
      </header>

      <h3 className="border-b-2 border-action-primary pb-1 text-sm font-semibold text-text-heading">
        {t('nodeDetail.liveStatus')}
      </h3>

      {query.isPending && (
        <div role="status" aria-label={t('nodeDetail.loading')} className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <Skeleton key={row} shape="rect" className="h-10 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-text-primary">
          <p>{t(isNotFound ? 'nodeDetail.notFound' : 'nodeDetail.error')}</p>
          {!isNotFound && (
            <Button
              label={t('nodeDetail.retry')}
              variant="outline"
              onClick={() => void query.refetch()}
            />
          )}
        </div>
      )}

      {detail && <NodeDetailBody detail={detail} />}
    </aside>
  )
}

interface NodeDetailBodyProps {
  detail: NodeDetail
}

function NodeDetailBody({ detail }: NodeDetailBodyProps) {
  const { t } = useTranslation('dashboard')
  const fuseCount = detail.fuseSets.reduce((total, set) => total + set.fuses.length, 0)

  return (
    <>
      {detail.fuseSets.length > 0 && (
        <section
          aria-label={t('nodeDetail.fuseSets')}
          className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface-alt p-3"
        >
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
              <Icon name="fuse" size="sm" />
              {t('nodeDetail.fuseSets')}
            </h3>
            <span className="text-xs text-text-secondary">
              {t('nodeDetail.fuseSetsSummary', {
                sets: detail.fuseSets.length,
                fuses: fuseCount,
              })}
            </span>
          </header>
          {detail.fuseSets.map((set) => (
            <FuseSetCard key={set.id} set={set} />
          ))}
        </section>
      )}
      {detail.transformers.map((transformer) => (
        <TransformerCard key={transformer.id} transformer={transformer} />
      ))}
    </>
  )
}
