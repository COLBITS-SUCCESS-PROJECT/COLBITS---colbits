/** useInactiveDevicesPanel — props of the Inactive devices tab: devices from the API, filters, scope and ordered list. */
import { useMemo } from 'react'
import type { InactiveDevicesTabProps } from '../components/FaultPanel/InactiveDevicesTab'
import { deriveInactiveScope, selectInactiveDevices } from '../model/inactiveDevices.rules'
import { useInactiveDevicesFilters } from './useInactiveDevicesFilters'
import { useInactiveDevicesQuery } from './useInactiveDevicesQuery'

export function useInactiveDevicesPanel(now: number): InactiveDevicesTabProps {
  const { filters, updateFilters } = useInactiveDevicesFilters()
  const query = useInactiveDevicesQuery()
  const devices = useMemo(() => query.data ?? [], [query.data])
  const scope = useMemo(() => deriveInactiveScope(devices, filters), [devices, filters])
  const views = useMemo(() => selectInactiveDevices(devices, filters, now), [devices, filters, now])

  return {
    devices: views,
    filters,
    scope,
    onFiltersChange: updateFilters,
    isLoading: query.isPending,
    isError: query.isError,
    onRetry: () => void query.refetch(),
  }
}
