import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from './settings'

describe('DEFAULT_SETTINGS', () => {
  it('contient un tableau themes vide', () => {
    expect(DEFAULT_SETTINGS.themes).toEqual([])
  })

  it('contient themesFolder à ".marpidian"', () => {
    expect(DEFAULT_SETTINGS.themesFolder).toBe('.marpidian')
  })
})

describe('mergeSettings', () => {
  it('fusionne les themes partiels avec les défauts', () => {
    const partial = { themes: [{ path: 'themes/foo.css' }] }
    const result = mergeSettings(partial)
    expect(result.themes).toHaveLength(1)
    expect(result.themes[0].path).toBe('themes/foo.css')
  })

  it('retourne les défauts si appelé sans argument', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('préserve themesFolder si fourni', () => {
    const result = mergeSettings({ themesFolder: 'custom/themes' })
    expect(result.themesFolder).toBe('custom/themes')
  })

  it('ignore les clés inconnues', () => {
    const result = mergeSettings({ unknown: true } as any)
    expect((result as any).unknown).toBeUndefined()
  })

  it('utilise exportDir sauvegardé si string', () => {
    expect(mergeSettings({ exportDir: 'my-exports' }).exportDir).toBe('my-exports')
  })

  it('utilise la valeur par défaut si exportDir absent', () => {
    expect(mergeSettings({}).exportDir).toBe('.marpidian-exports')
  })
})
