import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Themes } from './Themes'

describe('Themes', () => {
  let readFile: (path: string) => Promise<string>
  let onFileChange: (path: string, cb: () => void) => (() => void)

  beforeEach(() => {
    readFile = vi.fn().mockImplementation(async (path: string) => {
      const name = path.replace(/^themes\//, '').replace(/\.css$/, '')
      return `/* @theme ${name} */\nsection { background: red; }`
    })
    onFileChange = vi.fn().mockReturnValue(vi.fn())
  })

  it('crée une instance Marp sans thèmes si aucun chargé', () => {
    const themes = new Themes(readFile, onFileChange)
    const marp = themes.getMarpInstance()
    expect(marp).toBeDefined()
    expect(marp.themeSet.get('test-theme')).toBeUndefined()
  })

  it("charge un thème CSS et le retourne dans l'instance Marp", async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('themes/test-theme.css')
    const marp = themes.getMarpInstance()
    expect(readFile).toHaveBeenCalledWith('themes/test-theme.css')
    expect(marp.themeSet.get('test-theme')).toBeDefined()
  })

  it('enregistre un watcher sur le fichier CSS', async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('themes/test-theme.css')
    expect(onFileChange).toHaveBeenCalledWith('themes/test-theme.css', expect.any(Function))
  })

  it('charge plusieurs thèmes indépendamment', async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('themes/theme-a.css')
    await themes.loadTheme('themes/theme-b.css')
    expect(readFile).toHaveBeenCalledTimes(2)
    const marp = themes.getMarpInstance()
    expect(marp.themeSet.get('theme-a')).toBeDefined()
  })

  it('recharge un thème quand le fichier change', async () => {
    let changeCallback: (() => void) | undefined
    onFileChange = vi.fn().mockImplementation((_path, cb) => {
      changeCallback = cb
      return vi.fn()
    })
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('themes/test-theme.css')

    expect(readFile).toHaveBeenCalledTimes(1)
    changeCallback?.()
    await new Promise(r => setTimeout(r, 0))
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it('dispose nettoie les watchers', async () => {
    const cleanup = vi.fn()
    onFileChange = vi.fn().mockReturnValue(cleanup)
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('themes/test-theme.css')
    themes.dispose()
    expect(cleanup).toHaveBeenCalled()
  })
})
