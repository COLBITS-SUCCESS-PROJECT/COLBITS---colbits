/** Logo atom — official white Colbits wordmark for dark (navy) backgrounds (Figma: Logo · Light). */
import logoWhiteUrl from '@/assets/logo-colbits-white.png'
import { cn } from '@/utils/cn'

/** `md` = sidebar (Figma: 141×24). `lg` = login brand panel (Figma: Login / Default, 40 px tall). Source PNG is 300×51. */
export type LogoSize = 'md' | 'lg'

const LOGO_SIZE: Record<LogoSize, { width: number; height: number; className: string }> = {
  md: { width: 141, height: 24, className: 'h-6' },
  lg: { width: 235, height: 40, className: 'h-10' },
}

export interface LogoProps {
  /** Alt text, e.g. t('common:app.name'). Pass an empty string when the brand name is also written next to it. */
  label: string
  size?: LogoSize
  className?: string
}

export function Logo({ label, size = 'md', className }: LogoProps) {
  const dimensions = LOGO_SIZE[size]
  return (
    <img
      src={logoWhiteUrl}
      alt={label}
      width={dimensions.width}
      height={dimensions.height}
      className={cn('w-auto shrink-0', dimensions.className, className)}
    />
  )
}
