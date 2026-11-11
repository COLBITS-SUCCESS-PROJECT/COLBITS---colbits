/** Unit tests for the in-memory useUserManagement hook. */
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { SAMPLE_USERS } from '../model/users.sampleData'
import type { ManagedUser } from '../model/users.types'
import { useUserManagement } from './useUserManagement'

const byId = (users: ManagedUser[], id: string) => users.find((user) => user.id === id)

describe('useUserManagement', () => {
  it('starts with the sample users', () => {
    const { result } = renderHook(() => useUserManagement())

    expect(result.current.users).toEqual(SAMPLE_USERS)
  })

  it('deactivates and reactivates a user keeping the scope', () => {
    const { result } = renderHook(() => useUserManagement())
    const scope = byId(SAMPLE_USERS, 'u-1')?.scope

    act(() => result.current.setStatus('u-1', 'INACTIVE'))
    expect(byId(result.current.users, 'u-1')).toMatchObject({ status: 'INACTIVE', scope })

    act(() => result.current.setStatus('u-1', 'ACTIVE'))
    expect(byId(result.current.users, 'u-1')).toMatchObject({ status: 'ACTIVE', scope })
  })

  it('leaves the other users unchanged', () => {
    const { result } = renderHook(() => useUserManagement())

    act(() => result.current.setStatus('u-1', 'INACTIVE'))

    expect(byId(result.current.users, 'u-2')).toBe(byId(SAMPLE_USERS, 'u-2'))
  })
})
