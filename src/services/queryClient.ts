/** TanStack Query client con configuración por defecto del proyecto. */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status
        if (status !== undefined && status < 500) return false
        return failureCount < 1
      },
    },
  },
})
