/** Maps domain states to design-system status tokens — one place so markers, legend and cards always agree. */
import type { StatusDotStatus } from '@/design-system/atoms'
import type { FaultSeverity, NetworkState } from '../model/liveMonitoring.types'

export const STATE_TO_STATUS: Record<NetworkState, StatusDotStatus> = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INACTIVE: 'offline',
  NORMAL: 'online',
  UNKNOWN: 'unknown',
}

export const STATE_BG_CLASS: Record<NetworkState, string> = {
  CRITICAL: 'bg-status-critical',
  WARNING: 'bg-status-warning',
  INACTIVE: 'bg-status-offline',
  NORMAL: 'bg-status-online',
  UNKNOWN: 'bg-status-unknown',
}

/** Text color that stays readable on each state background (the count of a cluster). */
export const STATE_TEXT_CLASS: Record<NetworkState, string> = {
  CRITICAL: 'text-text-inverse',
  WARNING: 'text-text-primary',
  INACTIVE: 'text-text-primary',
  NORMAL: 'text-text-primary',
  UNKNOWN: 'text-text-primary',
}

/** Accent of a resolved alarm card: neutral gray, whatever its severity (Figma M11). */
export const RESOLVED_BG_CLASS = 'bg-status-offline'

export const SEVERITY_BG_CLASS: Record<FaultSeverity, string> = {
  CRITICAL: 'bg-status-critical',
  WARNING: 'bg-status-warning',
  INACTIVE: 'bg-status-offline',
}
