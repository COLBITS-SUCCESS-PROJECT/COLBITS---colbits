/** Vite client types — gives `import.meta.env` and asset imports their TypeScript types. */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_ENV?: 'development' | 'production'
  readonly VITE_ENABLE_MSW?: string
  readonly VITE_DEV_MOCK_SESSION?: string
  readonly VITE_MAP_TILE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
