import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
vi.stubEnv('VITE_APP_ENV', 'development')
vi.stubEnv('VITE_ENABLE_MSW', 'false')
