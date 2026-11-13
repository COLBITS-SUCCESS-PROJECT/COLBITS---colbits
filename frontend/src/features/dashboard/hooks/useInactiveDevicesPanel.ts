/** useInactiveDevicesPanel — props of the Inactive devices tab: sample devices, filters, scope and ordered list. */
import { useMemo, useState } from 'react'
import { FEATURES } from '@/config/features'
import { buildInactiveDevicesMock } from '@/mocks/data/inactiveDevices.fixtures'
import type { InactiveDevicesTabProps } from '../components/FaultPanel/InactiveDevicesTab'
import { deriveInactiveScope, selectInactiveDevices } from '../model/inactiveDevices.rules'
import { useInactiveDevicesFilters } from './useInactiveDevicesFilters'

/**
 * null while the sample data is off: the tab then says the list is coming.
 * TODO SCRUM-115: replace the sample devices with the inactive-devices endpoint once the backend publishes it.
 */
export function useInactiveDevicesPanel(now: number): InactiveDevicesTabProps | null {
  const { filters, updateFilters } = useInactiveDevicesFilters()
  const [devices] = useState(() =>
    FEATURES.INACTIVE_DEVICES_SAMPLE_DATA ? buildInactiveDevicesMock(Date.now()) : null
  )
  const scope = useMemo(() => deriveInactiveScope(devices ?? [], filters), [devices, filters])
  const views = useMemo(
    () => selectInactiveDevices(devices ?? [], filters, now),
    [devices, filters, now]
  )

  if (!devices) return null
  return {
    devices: views,
    filters,
    scope,
    onFiltersChange: updateFilters,
    isLoading: false,
    isError: false,
    onRetry: () => undefined,
  }
}
