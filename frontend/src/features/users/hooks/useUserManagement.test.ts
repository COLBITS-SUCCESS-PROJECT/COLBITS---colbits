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

  it('creates an active user with its scope (F-07)', () => {
    const { result } = renderHook(() => useUserManagement())
    const scope = [{ id: 'CIRCUIT:CR-12', level: 'CIRCUIT' as const, name: 'CR-12' }]

    act(() => result.current.createUser({ name: 'Paula Ríos', email: 'p@colbits.com', scope }))

    expect(result.current.users).toHaveLength(SAMPLE_USERS.length + 1)
    expect(result.current.users[result.current.users.length - 1]).toMatchObject({
      name: 'Paula Ríos',
      status: 'ACTIVE',
      scope,
    })
  })

  it('lets two users share the same scope element (F-09, AC7)', () => {
    const { result } = renderHook(() => useUserManagement())
    const scope = byId(SAMPLE_USERS, 'u-1')?.scope ?? []

    act(() => result.current.createUser({ name: 'Otra', email: 'otra@colbits.com', scope }))

    expect(byId(result.current.users, 'u-1')?.scope).toEqual(scope)
    expect(result.current.users[result.current.users.length - 1]?.scope).toEqual(scope)
  })

  it('updates the data and scope of a user and keeps the status', () => {
    const { result } = renderHook(() => useUserManagement())
    const scope = [{ id: 'ZONE:Z-02', level: 'ZONE' as const, name: 'Z-02' }]

    act(() =>
      result.current.updateUser('u-4', { name: 'Andrés I.', email: 'ai@colbits.com', scope })
    )

    expect(byId(result.current.users, 'u-4')).toEqual({
      id: 'u-4',
      name: 'Andrés I.',
      email: 'ai@colbits.com',
      status: 'INACTIVE',
      scope,
    })
  })

  it('detects a taken email ignoring case, except for the user being edited', () => {
    const { result } = renderHook(() => useUserManagement())

    expect(result.current.isEmailTaken(' Laura.Gomez@colbits.com ')).toBe(true)
    expect(result.current.isEmailTaken('laura.gomez@colbits.com', 'u-1')).toBe(false)
    expect(result.current.isEmailTaken('nueva@colbits.com')).toBe(false)
  })

  it('leaves the other users unchanged', () => {
    const { result } = renderHook(() => useUserManagement())

    act(() => result.current.setStatus('u-1', 'INACTIVE'))

    expect(byId(result.current.users, 'u-2')).toBe(byId(SAMPLE_USERS, 'u-2'))
  })
})
