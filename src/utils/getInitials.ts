/** Derives up to two uppercase initials from a person's or device's display name. */
export const MAX_INITIALS = 2

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join('')
}
