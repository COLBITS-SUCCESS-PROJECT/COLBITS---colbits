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

export const ENV = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
  APP_ENV: (import.meta.env['VITE_APP_ENV'] ?? 'development') as 'development' | 'production',
  ENABLE_MSW: import.meta.env['VITE_ENABLE_MSW'] === 'true',
} as const
