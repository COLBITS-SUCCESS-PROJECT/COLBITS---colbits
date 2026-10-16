/** MapMarker molecule — fuse, transformer, combined or cluster pin on the map (Figma: Map Marker). */
import type { CSSProperties } from 'react'
import { Icon } from '@/design-system/atoms'
import { cn } from '@/utils/cn'
import type { NetworkState } from '../../model/liveMonitoring.types'
import { STATE_BG_CLASS } from '../networkStateStyles'

export type MapMarkerVariant =
  | { kind: 'fuse'; state: NetworkState }
  | { kind: 'transformer'; state: NetworkState }
  | { kind: 'both'; fuseState: NetworkState; transformerState: NetworkState }
  | { kind: 'cluster'; count: number }

export type MapMarkerProps = MapMarkerVariant & {
  /** Accessible description, e.g. "Nodo ND04821A07, fusible: Fusible abierto". */
  label: string
  /** When given, the marker is a button (opens the node detail). */
  onClick?: () => void
  className?: string
  /** Positioning on the map (left / top). */
  style?: CSSProperties
}

const SHADOW = 'shadow-marker'
const SINGLE = cn('flex border-2 border-bg-surface p-1.5 text-text-inverse', SHADOW)

function MarkerBody(props: MapMarkerVariant) {
  switch (props.kind) {
    case 'fuse':
      return (
        <span className={cn(SINGLE, 'rounded-full', STATE_BG_CLASS[props.state])}>
          <Icon name="fuse" size="sm" />
        </span>
      )
    case 'transformer':
      return (
        <span className={cn(SINGLE, 'rounded-md', STATE_BG_CLASS[props.state])}>
          <Icon name="transformer" size="sm" />
        </span>
      )
    case 'both':
      return (
        <span
          className={cn(
            'flex gap-0.5 rounded-full border border-border-strong bg-bg-surface p-0.75 text-text-inverse',
            SHADOW
          )}
        >
          <span className={cn('flex rounded-full p-1.25', STATE_BG_CLASS[props.fuseState])}>
            <Icon name="fuse" size="xs" />
          </span>
          <span className={cn('flex rounded-tile p-1.25', STATE_BG_CLASS[props.transformerState])}>
            <Icon name="transformer" size="xs" />
          </span>
        </span>
      )
    case 'cluster':
      return (
        <span className="flex size-10 items-center justify-center rounded-full border-3 border-bg-surface bg-bg-inverse text-sm font-bold text-text-inverse shadow-cluster">
          {props.count}
        </span>
      )
  }
}

export function MapMarker({ label, onClick, className, style, ...variant }: MapMarkerProps) {
  const body = <MarkerBody {...(variant as MapMarkerVariant)} />

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        data-kind={variant.kind}
        onClick={onClick}
        style={style}
        className={cn(
          'touch-target rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          className
        )}
      >
        {body}
      </button>
    )
  }

  return (
    <span
      role="img"
      aria-label={label}
      data-kind={variant.kind}
      style={style}
      className={cn('inline-flex', className)}
    >
      {body}
    </span>
  )
}
