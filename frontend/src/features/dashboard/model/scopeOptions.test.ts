/** Unit tests for deriveScopeOptions. */
import { describe, it, expect } from 'vitest'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import { deriveScopeOptions } from './scopeOptions'

describe('deriveScopeOptions', () => {
  it('returns unique, sorted zones, substations and circuits', () => {
    // Arrange
    const { faults } = buildLiveMonitoringMock(0)

    // Act
    const options = deriveScopeOptions(faults)

    // Assert
    expect(options.zones).toEqual(['Z-01'])
    expect(options.substations).toEqual(['SE-Centro', 'SE-Norte', 'SE-Sur'])
    expect(options.circuits).toEqual(['CR-03', 'CR-07', 'CR-12', 'CR-21'])
  })

  it('leaves out zones and substations the service does not send', () => {
    const [fault] = buildLiveMonitoringMock(0).faults
    const fromApi = { ...fault!, zone: null, substation: null } // fixture has faults

    expect(deriveScopeOptions([fromApi])).toEqual({
      zones: [],
      substations: [],
      circuits: ['CR-12'],
    })
  })

  it('returns empty lists when there are no faults', () => {
    expect(deriveScopeOptions([])).toEqual({ zones: [], substations: [], circuits: [] })
  })
})
