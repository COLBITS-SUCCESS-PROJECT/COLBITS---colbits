/**
 * Pure logic of the scope tree (F-08). The selection holds exactly the elements the administrator
 * ticked. A ticked element covers everything under it, so its descendants show as checked and
 * locked and are never stored on their own. Nothing is promoted upwards: ticking the only node of a
 * circuit assigns that node, not the circuit (new nodes of the circuit stay out of the scope).
 */
import { normalizeSearch } from './normalizeSearch'
import type { ScopeItem, ScopeNode } from './users.types'

export type CheckState = 'checked' | 'partial' | 'unchecked'

export interface ScopeTreeRowModel {
  node: ScopeNode
  isExpanded: boolean
  /** An ancestor is ticked: the row shows checked and cannot be changed. */
  isCovered: boolean
}

function findNode(tree: ScopeNode[], id: string): ScopeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return undefined
}

function descendantIds(node: ScopeNode): string[] {
  return node.children.flatMap((child) => [child.id, ...descendantIds(child)])
}

export function toggleScopeNode(
  tree: ScopeNode[],
  selected: ReadonlySet<string>,
  nodeId: string,
  checked: boolean
): Set<string> {
  const node = findNode(tree, nodeId)
  const next = new Set(selected)
  if (!node) return next
  if (checked) {
    // The ticked element now covers its subtree, so ticks below it are redundant.
    descendantIds(node).forEach((id) => next.delete(id))
    next.add(node.id)
  } else {
    next.delete(node.id)
  }
  return next
}

export function getCheckState(
  node: ScopeNode,
  selected: ReadonlySet<string>,
  isCovered = false
): CheckState {
  if (isCovered || selected.has(node.id)) return 'checked'
  return descendantIds(node).some((id) => selected.has(id)) ? 'partial' : 'unchecked'
}

/** Ticked elements in tree order — the scope saved for the user. */
export function selectionToScope(tree: ScopeNode[], selected: ReadonlySet<string>): ScopeItem[] {
  return tree.flatMap((node) =>
    selected.has(node.id)
      ? [{ id: node.id, level: node.level, name: node.name }]
      : selectionToScope(node.children, selected)
  )
}

/** Selection of a saved scope. Items no longer in the tree, or covered by another item, are dropped. */
export function scopeToSelection(tree: ScopeNode[], scope: ScopeItem[]): Set<string> {
  const assigned = new Set(scope.map((item) => item.id))
  return new Set(selectionToScope(tree, assigned).map((item) => item.id))
}

/** Elements with something ticked below them: opened when the tree is first shown. */
export function partiallyCheckedIds(tree: ScopeNode[], selected: ReadonlySet<string>): Set<string> {
  const ids = new Set<string>()
  const visit = (nodes: ScopeNode[]) =>
    nodes.forEach((node) => {
      if (getCheckState(node, selected) === 'partial') ids.add(node.id)
      visit(node.children)
    })
  visit(tree)
  return ids
}

function matches(node: ScopeNode, query: string): boolean {
  return normalizeSearch(`${node.name} ${node.description ?? ''}`).includes(query)
}

/**
 * Rows to render, in order. Without a search, children show only under expanded nodes. With a
 * search, every match shows with the path that leads to it.
 */
export function visibleScopeRows(
  tree: ScopeNode[],
  selected: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
  search: string
): ScopeTreeRowModel[] {
  const query = normalizeSearch(search)

  function walk(nodes: ScopeNode[], isCovered: boolean): ScopeTreeRowModel[] {
    return nodes.flatMap((node) => {
      const childrenCovered = isCovered || selected.has(node.id)
      if (!query) {
        const isExpanded = expanded.has(node.id)
        const children = isExpanded ? walk(node.children, childrenCovered) : []
        return [{ node, isExpanded, isCovered }, ...children]
      }
      const children = walk(node.children, childrenCovered)
      if (children.length > 0) return [{ node, isExpanded: true, isCovered }, ...children]
      return matches(node, query) ? [{ node, isExpanded: false, isCovered }] : []
    })
  }

  return walk(tree, false)
}
