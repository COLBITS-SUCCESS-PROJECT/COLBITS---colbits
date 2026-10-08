/** Typed route catalog — never write route strings directly, always import from here. */
export const ROUTES = {
  home: '/',
  login: '/login',
  dashboard: '/dashboard',
  analysis: '/analysis',
  devices: '/devices',
  device: (id: string) => `/devices/${id}`,
  alerts: '/alerts',
  reports: '/reports',
  settings: '/settings',
} as const
