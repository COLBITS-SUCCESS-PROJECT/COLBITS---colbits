/** Every UI text must exist in Spanish and in English with the same keys (SCRUM-158 AC5, AGENT.md §10). */
import { describe, it, expect } from 'vitest'
import { SUPPORTED_LANGUAGES } from '@/config/languages'
import { resources } from './index'

type Tree = { [key: string]: string | Tree }

function keyPaths(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [path] : keyPaths(value, path)
  })
}

const [reference, ...others] = SUPPORTED_LANGUAGES
const namespaces = Object.keys(resources[reference]) as Array<keyof (typeof resources)[typeof reference]>

describe('translations', () => {
  it.each(others)('%s has the same namespaces as the default language', (language) => {
    expect(Object.keys(resources[language]).sort()).toEqual([...namespaces].sort())
  })

  describe.each(others)('%s', (language) => {
    it.each(namespaces)('has every key of the %s namespace, and no extra one', (namespace) => {
      const expected = keyPaths(resources[reference][namespace] as Tree).sort()
      const actual = keyPaths(resources[language][namespace] as Tree).sort()

      expect(actual).toEqual(expected)
    })
  })

  it.each(SUPPORTED_LANGUAGES)('%s has no empty text', (language) => {
    for (const namespace of namespaces) {
      const tree = resources[language][namespace] as Tree
      const empty = keyPaths(tree).filter((path) => {
        const value = path.split('.').reduce<string | Tree>((node, key) => (node as Tree)[key], tree)
        return typeof value === 'string' && value.trim() === ''
      })
      expect(empty, `${language}/${namespace}`).toEqual([])
    }
  })
})
