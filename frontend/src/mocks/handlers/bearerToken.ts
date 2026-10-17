/** Reads the token of an `Authorization: Bearer <token>` header; empty string when there is none. */
const BEARER_PREFIX = 'Bearer '

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? ''
  return authorization.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : ''
}
