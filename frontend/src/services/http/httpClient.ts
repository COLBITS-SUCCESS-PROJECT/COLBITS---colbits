/** HTTP client — thin wrapper over native fetch. See ADR-0003. */
import { ENV } from '@/config/env'
import { useAuthStore } from '@/stores/auth.store'

const TIMEOUT_MS = 10_000

/** Must match ROUTES.login (services cannot import the router). */
export const LOGIN_PATH = '/login'
/** Query string the login page reads to explain that the session ended (F-02). */
export const SESSION_EXPIRED_PARAM = 'session'
export const SESSION_EXPIRED_VALUE = 'expired'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string,
    public readonly errors: Array<{ field: string; message: string }> = []
  ) {
    super(title)
    this.name = 'ApiError'
  }

  isUnauthorized() {
    return this.status === 401
  }
  isForbidden() {
    return this.status === 403
  }
  isNotFound() {
    return this.status === 404
  }
  isConflict() {
    return this.status === 409
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
  /** Throw the 401 as an ApiError instead of ending the session and reloading `/login` (e.g. the login call itself). */
  skipAuthRedirect?: boolean
}

export async function httpClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal: externalSignal, skipAuthRedirect = false } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort())
  }

  const token = useAuthStore.getState().token
  const locale = document.documentElement.lang ?? 'es-CO'

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept-Language': locale,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  try {
    const res = await fetch(`${ENV.API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.status === 401 && !skipAuthRedirect) {
      // F-02: the API rejected the token (missing, expired, altered or logged out). End the session and
      // reload the login page: the reload drops every cached response, and replace() keeps the protected
      // page out of the history, so "back" cannot show its data again.
      useAuthStore.getState().clearAuth()
      window.location.replace(`${LOGIN_PATH}?${SESSION_EXPIRED_PARAM}=${SESSION_EXPIRED_VALUE}`)
      throw new ApiError(401, 'Unauthorized', 'Session expired')
    }

    if (!res.ok) {
      const problem = await res.json().catch(() => ({}))
      throw new ApiError(
        res.status,
        problem.title ?? 'Error',
        problem.detail ?? '',
        problem.errors ?? []
      )
    }

    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof ApiError) throw err
    if ((err as Error).name === 'AbortError') {
      throw new ApiError(408, 'Request timeout', 'The request took too long')
    }
    throw err
  }
}
