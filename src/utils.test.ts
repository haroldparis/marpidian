import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, detectMarpDocument, extractThemeName, hasOutOfVaultImageRef } from './utils'

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

  it('retourne false si marp: "false" (string)', () => {
    const md = '---\nmarp: "false"\n---\n\n# Note'
    expect(detectMarpDocument(md)).toBe(false)
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

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

describe('hasOutOfVaultImageRef', () => {
  const vault = '/home/user/vault'
  const fileDir = '/home/user/vault/slides'

  it('retourne false pour une image relative dans le vault', () => {
    expect(hasOutOfVaultImageRef('![](image.png)', vault, fileDir)).toBe(false)
  })

  it('retourne false pour une image dans un sous-dossier du vault', () => {
    expect(hasOutOfVaultImageRef('![](assets/photo.png)', vault, fileDir)).toBe(false)
  })

  it('retourne false pour une URL http', () => {
    expect(hasOutOfVaultImageRef('![](https://example.com/img.png)', vault, fileDir)).toBe(false)
  })

  it('retourne false pour une data URL', () => {
    expect(hasOutOfVaultImageRef('![](data:image/png;base64,abc)', vault, fileDir)).toBe(false)
  })

  it('retourne true pour un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('![](/etc/passwd)', vault, fileDir)).toBe(true)
  })

  it('retourne true pour un chemin file://', () => {
    expect(hasOutOfVaultImageRef('![](file:///etc/shadow)', vault, fileDir)).toBe(true)
  })

  it('retourne true pour un chemin ~/', () => {
    expect(hasOutOfVaultImageRef('![](~/.ssh/id_rsa)', vault, fileDir)).toBe(true)
  })

  it('retourne true pour un traversal hors vault', () => {
    expect(hasOutOfVaultImageRef('![](../../.ssh/id_rsa)', vault, fileDir)).toBe(true)
  })

  it('retourne false si pas d\'image dans le markdown', () => {
    expect(hasOutOfVaultImageRef('# Titre\n\nDu texte.', vault, fileDir)).toBe(false)
  })

  // Balises HTML <img src> — vecteur d'attaque possible avec Marp html:true
  it('retourne true pour <img src> pointant vers un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('<img src="/etc/passwd">', vault, fileDir)).toBe(true)
  })

  it('retourne true pour <img src> avec chemin ~/', () => {
    expect(hasOutOfVaultImageRef('<img src="~/.ssh/id_rsa">', vault, fileDir)).toBe(true)
  })

  it('retourne true pour <img src> avec traversal hors vault', () => {
    expect(hasOutOfVaultImageRef('<img src="../../.ssh/id_rsa">', vault, fileDir)).toBe(true)
  })

  it('retourne false pour <img src> avec image relative dans le vault', () => {
    expect(hasOutOfVaultImageRef('<img src="image.png">', vault, fileDir)).toBe(false)
  })

  it('retourne false pour <img src> avec URL https', () => {
    expect(hasOutOfVaultImageRef('<img src="https://example.com/img.png">', vault, fileDir)).toBe(false)
  })

  it('retourne true pour <img src> avec guillemets simples hors vault', () => {
    expect(hasOutOfVaultImageRef("<img src='/etc/passwd'>", vault, fileDir)).toBe(true)
  })

  it('retourne true pour <IMG SRC> en majuscules (insensible à la casse)', () => {
    expect(hasOutOfVaultImageRef('<IMG SRC="/etc/shadow">', vault, fileDir)).toBe(true)
  })

  // <object data> — Chrome rend les fichiers texte brut inline dans le PDF exporté
  it('retourne true pour <object data> pointant vers un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('<object data="/etc/passwd"></object>', vault, fileDir)).toBe(true)
  })

  it('retourne true pour <object data> avec traversal hors vault', () => {
    expect(hasOutOfVaultImageRef('<object data="../../.ssh/id_rsa"></object>', vault, fileDir)).toBe(true)
  })

  it('retourne false pour <object data> avec fichier dans le vault', () => {
    expect(hasOutOfVaultImageRef('<object data="diagram.pdf"></object>', vault, fileDir)).toBe(false)
  })

  // <embed src> — même vecteur que <object data>
  it('retourne true pour <embed src> pointant vers un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('<embed src="/etc/shadow">', vault, fileDir)).toBe(true)
  })

  it('retourne false pour <embed src> avec fichier dans le vault', () => {
    expect(hasOutOfVaultImageRef('<embed src="video.mp4">', vault, fileDir)).toBe(false)
  })

  // <video>, <audio>, <source> — Chromium accède aux fichiers locaux lors du rendu PDF
  it('retourne true pour <video src> pointant vers un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('<video src="/etc/passwd"></video>', vault, fileDir)).toBe(true)
  })

  it('retourne true pour <audio src> avec traversal hors vault', () => {
    expect(hasOutOfVaultImageRef('<audio src="../../.ssh/id_rsa"></audio>', vault, fileDir)).toBe(true)
  })

  it('retourne true pour <source src> pointant vers un chemin absolu', () => {
    expect(hasOutOfVaultImageRef('<source src="/etc/shadow">', vault, fileDir)).toBe(true)
  })

  it('retourne false pour <video src> avec fichier dans le vault', () => {
    expect(hasOutOfVaultImageRef('<video src="presentation.mp4"></video>', vault, fileDir)).toBe(false)
  })
})
