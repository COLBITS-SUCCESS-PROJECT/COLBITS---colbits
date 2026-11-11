/** Unit tests for the scope tree logic (SCRUM-250 AC6, F-08). */
import { describe, it, expect } from 'vitest'
import { SAMPLE_SCOPE_TREE as TREE } from './users.sampleData'
import {
  getCheckState,
  partiallyCheckedIds,
  scopeToSelection,
  selectionToScope,
  toggleScopeNode,
  visibleScopeRows,
} from './scopeTree'
import type { ScopeItem, ScopeNode } from './users.types'

const EMPTY = new Set<string>()
const node = (id: string): ScopeNode => {
  const stack = [...TREE]
  while (stack.length) {
    const current = stack.shift()
    if (current?.id === id) return current
    if (current) stack.push(...current.children)
  }
  throw new Error(`node ${id} missing`)
}
const scopeIds = (selected: Set<string>) => selectionToScope(TREE, selected).map((item) => item.id)
const rowIds = (rows: { node: ScopeNode }[]) => rows.map((row) => row.node.id)

describe('toggleScopeNode', () => {
  it('stores exactly the ticked element', () => {
    expect(toggleScopeNode(TREE, EMPTY, 'CIRCUIT:CR-12', true)).toEqual(new Set(['CIRCUIT:CR-12']))
  })

  it('does not promote the only child to its parent (F-08)', () => {
    const selected = toggleScopeNode(TREE, EMPTY, 'NODE:ND04821A07', true)

    expect(scopeIds(selected)).toEqual(['NODE:ND04821A07'])
  })

  it('drops the ticks below an element when the element is ticked', () => {
    let selected = toggleScopeNode(TREE, EMPTY, 'DEVICE:FAL-00412', true)
    selected = toggleScopeNode(TREE, selected, 'CIRCUIT:CR-21', true)
    selected = toggleScopeNode(TREE, selected, 'ZONE:Z-01', true)

    expect(selected).toEqual(new Set(['ZONE:Z-01']))
  })

  it('unticks an element', () => {
    const selected = toggleScopeNode(TREE, new Set(['ZONE:Z-01', 'ZONE:Z-02']), 'ZONE:Z-01', false)

    expect(selected).toEqual(new Set(['ZONE:Z-02']))
  })

  it('ignores an unknown element', () => {
    expect(toggleScopeNode(TREE, EMPTY, 'ZONE:nope', true)).toEqual(EMPTY)
  })
})

describe('getCheckState', () => {
  const selected = new Set(['CIRCUIT:CR-12'])

  it('reports checked, partial and unchecked elements', () => {
    expect(getCheckState(node('CIRCUIT:CR-12'), selected)).toBe('checked')
    expect(getCheckState(node('SUBSTATION:SE-Norte'), selected)).toBe('partial')
    expect(getCheckState(node('ZONE:Z-01'), selected)).toBe('partial')
    expect(getCheckState(node('ZONE:Z-02'), selected)).toBe('unchecked')
  })

  it('shows a covered element as checked', () => {
    expect(getCheckState(node('NODE:ND04821A07'), selected, true)).toBe('checked')
  })
})

describe('selectionToScope / scopeToSelection', () => {
  it.each([
    ['zone', 'ZONE:Z-02'],
    ['substation', 'SUBSTATION:SE-Sur'],
    ['circuit', 'CIRCUIT:CR-14'],
    ['node', 'NODE:ND04821A07'],
    ['device', 'DEVICE:FAL-00412'],
  ])('saves a single %s as one scope item (F-08)', (_level, id) => {
    expect(scopeIds(toggleScopeNode(TREE, EMPTY, id, true))).toEqual([id])
  })

  it('returns the items in tree order with their level and name', () => {
    expect(selectionToScope(TREE, new Set(['DEVICE:FAL-00877', 'SUBSTATION:SE-Norte']))).toEqual([
      { id: 'SUBSTATION:SE-Norte', level: 'SUBSTATION', name: 'SE-Norte' },
      { id: 'DEVICE:FAL-00877', level: 'DEVICE', name: 'FAL-00877' },
    ])
  })

  it('drops saved items that are missing from the tree or covered by another item', () => {
    const scope: ScopeItem[] = [
      { id: 'ZONE:Z-03', level: 'ZONE', name: 'Z-03' },
      { id: 'NODE:ND06102D05', level: 'NODE', name: 'ND06102D05' },
      { id: 'NODE:ND04822B03', level: 'NODE', name: 'ND04822B03' },
      { id: 'NODE:gone', level: 'NODE', name: 'gone' },
    ]

    expect(scopeToSelection(TREE, scope)).toEqual(new Set(['NODE:ND04822B03', 'ZONE:Z-03']))
  })
})

describe('visibleScopeRows', () => {
  it('shows only the zones when nothing is expanded', () => {
    expect(rowIds(visibleScopeRows(TREE, EMPTY, EMPTY, ''))).toEqual([
      'ZONE:Z-01',
      'ZONE:Z-02',
      'ZONE:Z-03',
    ])
  })

  it('shows the children of expanded elements', () => {
    const rows = visibleScopeRows(TREE, EMPTY, new Set(['ZONE:Z-02']), '')

    expect(rowIds(rows)).toEqual(['ZONE:Z-01', 'ZONE:Z-02', 'SUBSTATION:SE-Oriente', 'ZONE:Z-03'])
    expect(rows[1]?.isExpanded).toBe(true)
  })

  it('marks the rows under a ticked element as covered', () => {
    const rows = visibleScopeRows(
      TREE,
      new Set(['ZONE:Z-02']),
      new Set(['ZONE:Z-02', 'SUBSTATION:SE-Oriente']),
      ''
    )

    expect(rows.find((row) => row.node.id === 'ZONE:Z-02')?.isCovered).toBe(false)
    expect(rows.find((row) => row.node.id === 'SUBSTATION:SE-Oriente')?.isCovered).toBe(true)
    expect(rows.find((row) => row.node.id === 'CIRCUIT:CR-07')?.isCovered).toBe(true)
  })

  it('shows every match with its path while searching, ignoring accents and case', () => {
    expect(rowIds(visibleScopeRows(TREE, EMPTY, EMPTY, 'cr-2'))).toEqual([
      'ZONE:Z-01',
      'SUBSTATION:SE-Sur',
      'CIRCUIT:CR-21',
    ])
    expect(rowIds(visibleScopeRows(TREE, EMPTY, EMPTY, 'DISTRITO ORIENTE'))).toEqual(['ZONE:Z-02'])
  })

  it('returns nothing when the search matches no element', () => {
    expect(visibleScopeRows(TREE, EMPTY, EMPTY, 'zzz')).toEqual([])
  })
})

describe('partiallyCheckedIds', () => {
  it('lists the ancestors of a ticked element', () => {
    expect(partiallyCheckedIds(TREE, new Set(['CIRCUIT:CR-12']))).toEqual(
      new Set(['ZONE:Z-01', 'SUBSTATION:SE-Norte'])
    )
  })
})
