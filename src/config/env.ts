/** Valida variables de entorno requeridas al importar. La app no arranca si falta alguna. */
function requireEnv(name: string): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(
      `[COLBITS] Variable de entorno requerida no configurada: ${name}\n` +
        `Copia .env.example a .env y completa el valor.`
    )
  }
  return value as string
}

export const ENV = {
  API_BASE_URL: requireEnv('VITE_API_BASE_URL'),
  APP_ENV: (import.meta.env['VITE_APP_ENV'] ?? 'development') as 'development' | 'production',
  ENABLE_MSW: import.meta.env['VITE_ENABLE_MSW'] === 'true',
} as const
