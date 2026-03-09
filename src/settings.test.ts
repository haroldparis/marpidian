import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from './settings'
import type { MarpidianSettings } from './settings'

describe('DEFAULT_SETTINGS', () => {
  it('contient un tableau themes vide', () => {
    expect(DEFAULT_SETTINGS.themes).toEqual([])
  })
})

describe('mergeSettings', () => {
  it('fusionne les settings partiels avec les défauts', () => {
    const partial = { themes: [{ name: 'foo', path: 'themes/foo.css' }] }
    const result = mergeSettings(partial)
    expect(result.themes).toHaveLength(1)
    expect(result.themes[0].name).toBe('foo')
  })

  it('retourne les défauts si appelé sans argument', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('ignore les clés inconnues', () => {
    const result = mergeSettings({ unknown: true } as any)
    expect((result as any).unknown).toBeUndefined()
  })
})
