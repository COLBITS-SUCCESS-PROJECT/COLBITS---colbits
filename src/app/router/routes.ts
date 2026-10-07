/** Catálogo de rutas tipado — nunca escribir strings de ruta directamente. */
export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  devices: '/devices',
  device: (id: string) => `/devices/${id}`,
  alerts: '/alerts',
  reports: '/reports',
  settings: '/settings',
} as const
