/**
 * Tokens invalidated by the mock logout, like the backend's token_blacklist table (F-11).
 * Lives in memory: a page reload (dev) or `resetRevokedTokens()` (tests) empties it.
 */
const revokedTokens = new Set<string>()

export function revokeToken(token: string): void {
  revokedTokens.add(token)
}

export function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token)
}

export function resetRevokedTokens(): void {
  revokedTokens.clear()
}
