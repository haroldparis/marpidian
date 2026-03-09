import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectMarpDocument, debounce, extractThemeName } from './utils'

describe('detectMarpDocument', () => {
  it('retourne true si marp: true est dans le frontmatter', () => {
    const md = '---\nmarp: true\ntitle: Test\n---\n\n# Slide'
    expect(detectMarpDocument(md)).toBe(true)
  })

  it('retourne false si marp: false', () => {
    const md = '---\nmarp: false\n---\n\n# Note'
    expect(detectMarpDocument(md)).toBe(false)
  })

  it('retourne false si pas de frontmatter', () => {
    const md = '# Simple note\n\nPas de frontmatter.'
    expect(detectMarpDocument(md)).toBe(false)
  })

  it('retourne false si frontmatter sans marp', () => {
    const md = '---\ntitle: Mon titre\ntags: [foo]\n---\n\n# Note'
    expect(detectMarpDocument(md)).toBe(false)
  })

  it('retourne true avec des espaces autour de la valeur', () => {
    const md = '---\nmarp:  true  \n---\n\n# Slide'
    expect(detectMarpDocument(md)).toBe(true)
  })

  it('retourne true si marp: "true" (string — comportement Obsidian)', () => {
    const md = '---\nmarp: "true"\n---\n\n# Slide'
    expect(detectMarpDocument(md)).toBe(true)
  })

  it("retourne false si marp: \"false\" (string)", () => {
    const md = '---\nmarp: "false"\n---\n\n# Note'
    expect(detectMarpDocument(md)).toBe(false)
  })
})

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("n'appelle la fonction qu'une fois après le délai", () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    debounced()
    debounced()

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('transmet les arguments correctement', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('hello', 42)
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith('hello', 42)
  })
})

describe('extractThemeName', () => {
  it('extrait le nom depuis /* @theme name */', () => {
    const css = '/* @theme einstein */\nsection { color: red; }'
    expect(extractThemeName(css)).toBe('einstein')
  })

  it('retourne null si pas de directive @theme', () => {
    const css = 'section { color: red; }'
    expect(extractThemeName(css)).toBeNull()
  })

  it('tolère les espaces autour du nom', () => {
    const css = '/*  @theme  my-theme  */\nsection {}'
    expect(extractThemeName(css)).toBe('my-theme')
  })

  it('extrait uniquement le premier mot du nom', () => {
    const css = '/* @theme my-theme v2 */\nsection {}'
    expect(extractThemeName(css)).toBe('my-theme')
  })
})
