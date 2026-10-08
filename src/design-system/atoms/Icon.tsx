/** Icon atom — renders a registry glyph by name; decorative unless a label is given. */
import { ICON_REGISTRY, ICON_SIZE_PX, type IconName, type IconSize } from './iconRegistry'

const DEFAULT_STROKE_WIDTH = 2

export interface IconProps {
  name: IconName
  size?: IconSize
  /** Accessible name. Omit for decorative icons (paired with visible text). */
  label?: string
  className?: string
}

export function Icon({ name, size = 'lg', label, className }: IconProps) {
  const Glyph = ICON_REGISTRY[name]
  if (!Glyph) return null

  const a11yProps = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true, focusable: false }

  return (
    <Glyph
      size={ICON_SIZE_PX[size]}
      strokeWidth={DEFAULT_STROKE_WIDTH}
      className={className}
      data-icon={name}
      {...a11yProps}
    />
  )
}
