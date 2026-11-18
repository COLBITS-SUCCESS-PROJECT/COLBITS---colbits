/** Unit tests for filterUsers. */
import { describe, it, expect } from 'vitest'
import { filterUsers } from './userFilters'
import { SAMPLE_USERS } from './users.sampleData'

const names = (users: { name: string }[]) => users.map((user) => user.name)

describe('filterUsers', () => {
  it('returns every user with no search and all statuses', () => {
    expect(filterUsers(SAMPLE_USERS, { search: '', status: 'ALL' })).toHaveLength(
      SAMPLE_USERS.length
    )
  })

  it('finds users by name ignoring case and accents', () => {
    expect(names(filterUsers(SAMPLE_USERS, { search: 'ANDRES', status: 'ALL' }))).toEqual([
      'Andrés Ibarra',
    ])
  })

  it('finds users by email', () => {
    expect(names(filterUsers(SAMPLE_USERS, { search: 'diana.rojas@', status: 'ALL' }))).toEqual([
      'Diana Rojas',
    ])
  })

  it('keeps only the chosen status', () => {
    const inactive = filterUsers(SAMPLE_USERS, { search: '', status: 'INACTIVE' })

    expect(inactive.every((user) => user.status === 'INACTIVE')).toBe(true)
    expect(inactive.length).toBeGreaterThan(0)
  })

  it('combines search and status', () => {
    expect(filterUsers(SAMPLE_USERS, { search: 'andres', status: 'ACTIVE' })).toEqual([])
  })

  it('returns nothing when no user matches', () => {
    expect(filterUsers(SAMPLE_USERS, { search: 'zzz', status: 'ALL' })).toEqual([])
  })
})
