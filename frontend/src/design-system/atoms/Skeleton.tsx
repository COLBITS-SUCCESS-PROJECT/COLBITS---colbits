/** Skeleton atom — pulsing placeholder block shown while content loads. */
import { cn } from '@/utils/cn'

export type SkeletonShape = 'text' | 'rect' | 'circle'

const SHAPE_CLASS: Record<SkeletonShape, string> = {
  text: 'h-4 w-full rounded',
  rect: 'h-full w-full rounded-lg',
  circle: 'size-9 rounded-full',
}

export interface SkeletonProps {
  shape?: SkeletonShape
  /** Override width / height for the slot being reserved (e.g. 'h-24 w-56'). */
  className?: string
}

/** Decorative: the parent region announces loading (aria-busy or a Spinner). */
export function Skeleton({ shape = 'text', className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      data-shape={shape}
      className={cn(
        'block animate-pulse bg-border-default motion-reduce:animate-none',
        SHAPE_CLASS[shape],
        className
      )}
    />
  )
}
