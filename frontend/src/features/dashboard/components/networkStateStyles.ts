/** Maps domain states to design-system status tokens — one place so markers, legend and cards always agree. */
import type { StatusDotStatus } from '@/design-system/atoms'
import type { FaultSeverity, NetworkState } from '../model/liveMonitoring.types'

export const STATE_TO_STATUS: Record<NetworkState, StatusDotStatus> = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INACTIVE: 'offline',
  NORMAL: 'online',
}

export const STATE_BG_CLASS: Record<NetworkState, string> = {
  CRITICAL: 'bg-status-critical',
  WARNING: 'bg-status-warning',
  INACTIVE: 'bg-status-offline',
  NORMAL: 'bg-status-online',
}

export const SEVERITY_BG_CLASS: Record<FaultSeverity, string> = {
  CRITICAL: 'bg-status-critical',
  WARNING: 'bg-status-warning',
  INACTIVE: 'bg-status-offline',
}
