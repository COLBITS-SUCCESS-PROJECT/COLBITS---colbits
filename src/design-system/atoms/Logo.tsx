/** Logo atom — official white Colbits wordmark for dark (navy) backgrounds (Figma: Logo · Light). */
import logoWhiteUrl from '@/assets/logo-colbits-white.png'
import { cn } from '@/utils/cn'

/** Rendered size in Figma (source PNG is 300×51). */
const LOGO_WIDTH_PX = 141
const LOGO_HEIGHT_PX = 24

export interface LogoProps {
  /** Alt text, e.g. t('common:app.name'). Pass an empty string when the brand name is also written next to it. */
  label: string
  className?: string
}

export function Logo({ label, className }: LogoProps) {
  return (
    <img
      src={logoWhiteUrl}
      alt={label}
      width={LOGO_WIDTH_PX}
      height={LOGO_HEIGHT_PX}
      className={cn('h-6 w-auto shrink-0', className)}
    />
  )
}
