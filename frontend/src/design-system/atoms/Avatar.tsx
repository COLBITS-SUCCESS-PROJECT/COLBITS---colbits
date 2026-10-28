/** Avatar atom — 36px circular user image with initials / icon fallback (Figma: Avatar). */
import { useState } from 'react'
import { Icon } from './Icon'
import { cn } from '@/utils/cn'
import { getInitials } from '@/utils/getInitials'

export interface AvatarProps {
  /** Full display name — used for the accessible name and the initials fallback. */
  name: string
  imageUrl?: string
  className?: string
}

export function Avatar({ name, imageUrl, className }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const initials = getInitials(name)
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl

  return (
    <span
      role="img"
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-bg-avatar text-label font-semibold text-text-inverse select-none',
        className
      )}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <Icon name="user" size="lg" />
      )}
    </span>
  )
}
