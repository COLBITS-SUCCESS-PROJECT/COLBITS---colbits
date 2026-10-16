/** Validates required environment variables at import time. App will not start if any are missing. */
function requireEnv(name: string): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(
      `[COLBITS] Required environment variable not configured: ${name}\n` +
        `Copy .env.example to .env and fill in the value.`
    )
  }
  return value as string
}

/** OpenStreetMap raster tiles (ADR-0006). Override to use another tile provider. */
const DEFAULT_MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export const ENV = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
  APP_ENV: (import.meta.env['VITE_APP_ENV'] ?? 'development') as 'development' | 'production',
  /** Mock API in the browser (MSW). Dev only — the worker is never started in production. */
  ENABLE_MSW: import.meta.env.DEV && import.meta.env['VITE_ENABLE_MSW'] === 'true',
  MAP_TILE_URL: (import.meta.env['VITE_MAP_TILE_URL'] ?? DEFAULT_MAP_TILE_URL) as string,
  /** Dev only: sign in a fake user so the app works without the backend. On unless set to 'false' (then the login page is used). */
  DEV_MOCK_SESSION: import.meta.env.DEV && import.meta.env['VITE_DEV_MOCK_SESSION'] !== 'false',
} as const
