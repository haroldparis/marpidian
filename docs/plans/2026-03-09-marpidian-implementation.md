# Marpidian Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Plugin Obsidian open-source qui affiche une preview Marp en temps réel dans un panneau split, avec registre de thèmes CSS custom.

**Architecture:** `utils.ts` (détection frontmatter, debounce) + `Themes.ts` (factory Marp, cache CSS, hot-reload) + `MarpPreviewView.ts` (ItemView + iframe) + `settings.ts` (persistance) orchestrés par `main.ts`. Rendu via `@marp-team/marp-core`, isolé dans un `<iframe srcdoc>`.

**Tech Stack:** TypeScript · `@marp-team/marp-core` · API Obsidian · esbuild · Vitest · MIT License

---

## Avant de commencer : consolider le corpus

**Lis ces documents dans cet ordre avant de toucher au code.**

### 1. Design document (contexte et décisions)

```
/home/harold/Workspace/code/marpidian/docs/plans/2026-03-09-marpidian-design.md
```

Ce fichier contient : le contexte du projet, le scope MVP, l'architecture, le flux
principal, le workflow de dev et les décisions de licence. C'est la référence de haut
niveau. Lis-le entièrement.

### 2. Référence principale : marp-vscode

Le plugin officiel Marp pour VS Code résout exactement les mêmes problèmes. Deux fichiers
clés à lire via `gh` CLI avant d'implémenter `Themes.ts` et `main.ts` :

```bash
# Gestion des thèmes (pattern observedThemes, hot-reload, getMarpThemeSetFor)
gh api repos/marp-team/marp-vscode/contents/src/themes.ts --jq '.content' | base64 -d

# Détection document Marp + orchestration
gh api repos/marp-team/marp-vscode/contents/src/observer.ts --jq '.content' | base64 -d
```

### 3. Documentation Obsidian Plugin API (via Context7)

Utilise Context7 (`mcp__context7__resolve-library-id` puis `mcp__context7__query-docs`)
avec la library ID `/websites/obsidian_md_plugins` pour ces sujets si un doute apparaît :

- `ItemView` / `WorkspaceLeaf` / `getLeaf`
- `workspace.on('active-leaf-change')` / `workspace.on('editor-change')`
- `PluginSettingTab` / `Setting`
- Hot Reload workflow

### 4. Documentation Marp Core (via Context7)

Library ID : `/marp-team/marp-core`

Sujets utiles : `marp.render()`, `marp.themeSet.add()`, options d'instanciation.

---

## Task 1 : Scaffolding du projet

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.js`
- Create: `manifest.json`
- Create: `.gitignore`

**Step 1: Cloner le sample plugin comme base**

```bash
cd /home/harold/Workspace/code/marpidian
gh repo clone obsidianmd/obsidian-sample-plugin . -- --depth=1
rm -rf .git
git init
```

**Step 2: Supprimer les fichiers inutiles du sample**

```bash
rm -f src/modal.ts src/view.ts styles.css
```

**Step 3: Remplacer `manifest.json`**

```json
{
  "id": "marpidian",
  "name": "Marpidian",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "State-of-the-art Marp integration for Obsidian. Live preview, custom themes, markdown-it plugins.",
  "author": "Harold Paris",
  "authorUrl": "https://github.com/haroldparis",
  "isDesktopOnly": true
}
```

Note: `isDesktopOnly: true` car on lit des fichiers CSS depuis le vault (Node.js filesystem).

**Step 4: Remplacer `package.json`**

```json
{
  "name": "marpidian",
  "version": "0.1.0",
  "description": "State-of-the-art Marp integration for Obsidian",
  "main": "main.js",
  "license": "MIT",
  "scripts": {
    "dev": "node esbuild.config.js --watch",
    "build": "node esbuild.config.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@marp-team/marp-core": "^3.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.21.0",
    "obsidian": "latest",
    "tslib": "^2.6.0",
    "typescript": "^5.0.0",
    "vitest": "^1.6.0"
  }
}
```

**Step 5: Remplacer `esbuild.config.js`**

```javascript
const esbuild = require('esbuild')
const builtins = require('builtin-modules')

const VAULT_PLUGIN_PATH =
  process.env.VAULT_PLUGIN_PATH ||
  '/home/harold/Workspace/brain/.obsidian/plugins/marpidian'

const isWatch = process.argv.includes('--watch')

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    '@lezer/*',
    ...builtins,
  ],
  format: 'cjs',
  platform: 'browser',
  outfile: `${VAULT_PLUGIN_PATH}/main.js`,
  watch: isWatch,
  sourcemap: isWatch ? 'inline' : false,
  logLevel: 'info',
})
```

**Step 6: Remplacer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowImportingTsExtensions": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES2018"]
  },
  "include": ["src/**/*.ts"]
}
```

**Step 7: Créer `.gitignore`**

```
node_modules/
main.js
*.js.map
docs/
.env
```

**Step 8: Créer le dossier plugin dans le vault**

```bash
mkdir -p /home/harold/Workspace/brain/.obsidian/plugins/marpidian
cp manifest.json /home/harold/Workspace/brain/.obsidian/plugins/marpidian/
```

**Step 9: Installer les dépendances**

```bash
npm install
```

Expected: `node_modules/` créé, `@marp-team/marp-core` présent.

**Step 10: Commit**

```bash
git add -A
git commit -m "chore: initial project scaffold"
```

---

## Task 2 : Infrastructure de test (mock Obsidian)

Le module `obsidian` n'existe pas dans Node.js. On fournit un mock minimal pour Vitest.

**Files:**
- Create: `src/__mocks__/obsidian.ts`
- Create: `vitest.config.ts`

**Step 1: Créer `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      obsidian: new URL('./src/__mocks__/obsidian.ts', import.meta.url).pathname,
    },
  },
})
```

**Step 2: Créer `src/__mocks__/obsidian.ts`**

Ce mock couvre uniquement ce que Marpidian utilise réellement.

```typescript
export class Plugin {
  app: App
  manifest: any
  constructor(app: App, manifest: any) {
    this.app = app
    this.manifest = manifest
  }
  async loadData(): Promise<any> { return {} }
  async saveData(_data: any): Promise<void> {}
  registerEvent(_event: any): void {}
  addCommand(_command: any): void {}
  addSettingTab(_tab: any): void {}
  registerView(_type: string, _factory: any): void {}
}

export class ItemView {
  app: App
  leaf: WorkspaceLeaf
  contentEl: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf
    this.app = leaf.app
    this.contentEl = document.createElement('div')
  }
  getViewType(): string { return '' }
  getDisplayText(): string { return '' }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class PluginSettingTab {
  app: App
  plugin: Plugin
  containerEl: HTMLElement
  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string): this { return this }
  setDesc(_desc: string): this { return this }
  addText(_cb: (text: any) => any): this { return this }
  addButton(_cb: (btn: any) => any): this { return this }
}

export class WorkspaceLeaf {
  app: App
  constructor(app: App) { this.app = app }
}

export interface App {
  vault: Vault
  workspace: Workspace
  metadataCache: MetadataCache
}

export interface Vault {
  read(file: TFile): Promise<string>
  on(event: string, cb: (...args: any[]) => any): EventRef
}

export interface Workspace {
  on(event: string, cb: (...args: any[]) => any): EventRef
  getLeaf(type: string, direction?: string): WorkspaceLeaf
  getLeavesOfType(type: string): WorkspaceLeaf[]
  revealLeaf(leaf: WorkspaceLeaf): Promise<void>
}

export interface MetadataCache {
  getFileCache(file: TFile): { frontmatter?: Record<string, any> } | null
}

export interface TFile {
  path: string
  name: string
  extension: string
}

export type EventRef = { id: string }
```

**Step 3: Vérifier que Vitest démarre sans erreur**

```bash
npm test
```

Expected: "No test files found" (pas encore de tests) — pas d'erreur de module.

**Step 4: Commit**

```bash
git add src/__mocks__/obsidian.ts vitest.config.ts
git commit -m "test: add obsidian mock and vitest config"
```

---

## Task 3 : `utils.ts` — detectMarpDocument + debounce

**Files:**
- Create: `src/utils.ts`
- Create: `src/utils.test.ts`

**Step 1: Écrire les tests**

```typescript
// src/utils.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectMarpDocument, debounce } from './utils'

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
```

**Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
npm test
```

Expected: FAIL — "Cannot find module './utils'"

**Step 3: Implémenter `utils.ts`**

```typescript
// src/utils.ts

/**
 * Detects whether a Markdown string is a Marp document.
 * A Marp document has `marp: true` in its YAML frontmatter.
 */
export function detectMarpDocument(markdown: string): boolean {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return false
  return /^marp:\s*true\s*$/m.test(match[1])
}

/**
 * Returns a debounced version of fn that delays invocation by `delay` ms.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
```

**Step 4: Lancer les tests — vérifier qu'ils passent**

```bash
npm test
```

Expected: PASS — 7 tests passed.

**Step 5: Commit**

```bash
git add src/utils.ts src/utils.test.ts
git commit -m "feat: add detectMarpDocument and debounce utils"
```

---

## Task 4 : `settings.ts` — types et données

**Files:**
- Create: `src/settings.ts`
- Create: `src/settings.test.ts`

**Step 1: Écrire les tests**

```typescript
// src/settings.test.ts
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
```

**Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
npm test
```

Expected: FAIL — "Cannot find module './settings'"

**Step 3: Implémenter `settings.ts`**

```typescript
// src/settings.ts

export interface ThemeEntry {
  name: string
  path: string
}

export interface MarpidianSettings {
  themes: ThemeEntry[]
}

export const DEFAULT_SETTINGS: MarpidianSettings = {
  themes: [],
}

export function mergeSettings(saved: Partial<MarpidianSettings>): MarpidianSettings {
  return {
    themes: Array.isArray(saved.themes) ? saved.themes : DEFAULT_SETTINGS.themes,
  }
}
```

**Step 4: Lancer les tests — vérifier qu'ils passent**

```bash
npm test
```

Expected: PASS — tous les tests passent.

**Step 5: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "feat: add MarpidianSettings types and mergeSettings"
```

---

## Task 5 : `Themes.ts` — factory Marp et registre de thèmes

**Files:**
- Create: `src/Themes.ts`
- Create: `src/Themes.test.ts`

**Step 1: Écrire les tests**

```typescript
// src/Themes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Themes } from './Themes'

// Marp Core est bundlé normalement, pas besoin de mock
// On teste le comportement observable (instance Marp retournée)

describe('Themes', () => {
  let readFile: (path: string) => Promise<string>
  let onFileChange: (path: string, cb: () => void) => (() => void)

  beforeEach(() => {
    readFile = vi.fn().mockResolvedValue(`/* @theme test-theme */\nsection { background: red; }`)
    onFileChange = vi.fn().mockReturnValue(vi.fn()) // retourne une fonction de nettoyage
  })

  it('crée une instance Marp sans thèmes si aucun chargé', () => {
    const themes = new Themes(readFile, onFileChange)
    const marp = themes.getMarpInstance()
    expect(marp).toBeDefined()
    // Le thème 'test-theme' n'est pas encore chargé
    expect(marp.themeSet.get('test-theme')).toBeUndefined()
  })

  it('charge un thème CSS et le retourne dans l\'instance Marp', async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('test-theme', 'themes/test-theme.css')
    const marp = themes.getMarpInstance()
    expect(readFile).toHaveBeenCalledWith('themes/test-theme.css')
    expect(marp.themeSet.get('test-theme')).toBeDefined()
  })

  it('enregistre un watcher sur le fichier CSS', async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('test-theme', 'themes/test-theme.css')
    expect(onFileChange).toHaveBeenCalledWith('themes/test-theme.css', expect.any(Function))
  })

  it('charge plusieurs thèmes indépendamment', async () => {
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('theme-a', 'themes/a.css')
    await themes.loadTheme('theme-b', 'themes/b.css')
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
    await themes.loadTheme('test-theme', 'themes/test-theme.css')

    expect(readFile).toHaveBeenCalledTimes(1)
    changeCallback?.()
    // Le rechargement est async, attendre la résolution
    await new Promise(r => setTimeout(r, 0))
    expect(readFile).toHaveBeenCalledTimes(2)
  })

  it('dispose nettoie les watchers', async () => {
    const cleanup = vi.fn()
    onFileChange = vi.fn().mockReturnValue(cleanup)
    const themes = new Themes(readFile, onFileChange)
    await themes.loadTheme('test-theme', 'themes/test-theme.css')
    themes.dispose()
    expect(cleanup).toHaveBeenCalled()
  })
})
```

**Step 2: Lancer les tests — vérifier qu'ils échouent**

```bash
npm test
```

Expected: FAIL — "Cannot find module './Themes'"

**Step 3: Implémenter `Themes.ts`**

```typescript
// src/Themes.ts
import Marp from '@marp-team/marp-core'

export class Themes {
  private cssCache = new Map<string, string>()       // path → css
  private cleanups = new Map<string, () => void>()   // path → cleanup watcher

  constructor(
    private readFile: (path: string) => Promise<string>,
    private onFileChange: (path: string, cb: () => void) => () => void
  ) {}

  async loadTheme(name: string, path: string): Promise<void> {
    const css = await this.readFile(path)
    this.cssCache.set(path, css)

    const cleanup = this.onFileChange(path, async () => {
      const updated = await this.readFile(path)
      this.cssCache.set(path, updated)
    })
    this.cleanups.set(path, cleanup)
  }

  getMarpInstance(): Marp {
    const marp = new Marp({ html: true })
    for (const css of this.cssCache.values()) {
      try {
        marp.themeSet.add(css)
      } catch {
        // CSS invalide — ignoré silencieusement
      }
    }
    return marp
  }

  dispose(): void {
    this.cleanups.forEach(cleanup => cleanup())
    this.cleanups.clear()
    this.cssCache.clear()
  }
}
```

**Step 4: Lancer les tests — vérifier qu'ils passent**

```bash
npm test
```

Expected: PASS — tous les tests passent.

**Step 5: Commit**

```bash
git add src/Themes.ts src/Themes.test.ts
git commit -m "feat: add Themes registry with hot-reload support"
```

---

## Task 6 : `MarpPreviewView.ts` — ItemView + iframe

> Pas de tests unitaires pour cette tâche : l'ItemView dépend du DOM Obsidian.
> Validation manuelle via hot-reload (Task 8).

**Files:**
- Create: `src/MarpPreviewView.ts`

**Step 1: Implémenter `MarpPreviewView.ts`**

```typescript
// src/MarpPreviewView.ts
import { ItemView, WorkspaceLeaf } from 'obsidian'
import type { Themes } from './Themes'
import { debounce } from './utils'

export const VIEW_TYPE_MARP = 'marpidian-preview'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''

  private scheduleRender = debounce(() => this.render(), 300)

  constructor(leaf: WorkspaceLeaf, themes: Themes) {
    super(leaf)
    this.themes = themes
  }

  getViewType(): string {
    return VIEW_TYPE_MARP
  }

  getDisplayText(): string {
    return 'Marp Preview'
  }

  getIcon(): string {
    return 'presentation'
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty()
    this.contentEl.style.cssText = 'padding: 0; overflow: hidden; height: 100%;'

    this.iframe = this.contentEl.createEl('iframe', {
      attr: {
        style: 'width: 100%; height: 100%; border: none; background: white;',
        sandbox: 'allow-scripts allow-same-origin',
      },
    })

    this.render()
  }

  async onClose(): Promise<void> {
    this.iframe = null
  }

  update(markdown: string): void {
    this.currentMarkdown = markdown
    this.scheduleRender()
  }

  private render(): void {
    if (!this.iframe) return

    const marp = this.themes.getMarpInstance()
    const { html, css } = marp.render(this.currentMarkdown)

    this.iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #888; overflow-y: auto; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`
  }
}
```

**Step 2: Commit**

```bash
git add src/MarpPreviewView.ts
git commit -m "feat: add MarpPreviewView ItemView with iframe rendering"
```

---

## Task 7 : `main.ts` — orchestration du plugin

> Validation manuelle via hot-reload (Task 8).

**Files:**
- Create: `src/main.ts`

**Step 1: Implémenter `main.ts`**

```typescript
// src/main.ts
import { Plugin, WorkspaceLeaf, MarkdownView } from 'obsidian'
import { MarpPreviewView, VIEW_TYPE_MARP } from './MarpPreviewView'
import { MarpidianSettingTab } from './settings'
import { Themes } from './Themes'
import { detectMarpDocument, debounce } from './utils'
import { DEFAULT_SETTINGS, mergeSettings } from './settings'
import type { MarpidianSettings } from './settings'

export default class MarpidianPlugin extends Plugin {
  settings: MarpidianSettings
  themes: Themes

  async onload(): Promise<void> {
    const saved = await this.loadData()
    this.settings = mergeSettings(saved ?? {})

    this.themes = new Themes(
      (path) => this.app.vault.adapter.read(path),
      (path, cb) => {
        const ref = this.app.vault.on('modify', (file) => {
          if (file.path === path) cb()
        })
        return () => this.app.vault.offref(ref)
      }
    )

    await this.loadThemes()

    this.registerView(VIEW_TYPE_MARP, (leaf) => new MarpPreviewView(leaf, this.themes))

    this.addCommand({
      id: 'toggle-marp-preview',
      name: 'Toggle Marp preview',
      callback: () => this.togglePreview(),
    })

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.onActiveLeafChange())
    )

    this.registerEvent(
      this.app.workspace.on('editor-change', debounce(() => this.onEditorChange(), 300))
    )

    this.addSettingTab(new MarpidianSettingTab(this.app, this))
  }

  async onunload(): Promise<void> {
    this.themes.dispose()
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    await this.loadThemes()
  }

  private async loadThemes(): Promise<void> {
    this.themes.dispose()
    for (const entry of this.settings.themes) {
      try {
        await this.themes.loadTheme(entry.name, entry.path)
      } catch {
        console.warn(`[Marpidian] Impossible de charger le thème: ${entry.path}`)
      }
    }
  }

  private async onActiveLeafChange(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!activeView) return

    const content = activeView.editor.getValue()
    if (detectMarpDocument(content)) {
      await this.openPreview()
      this.updatePreview(content)
    }
  }

  private onEditorChange(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!activeView) return

    const content = activeView.editor.getValue()
    if (!detectMarpDocument(content)) return

    this.updatePreview(content)
  }

  private async openPreview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP)
    if (existing.length > 0) return

    const leaf = this.app.workspace.getLeaf('split', 'vertical')
    await leaf.setViewState({ type: VIEW_TYPE_MARP, active: false })
  }

  private async togglePreview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP)
    if (existing.length > 0) {
      existing.forEach((leaf) => leaf.detach())
    } else {
      await this.openPreview()
    }
  }

  private updatePreview(markdown: string): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP).forEach((leaf) => {
      if (leaf.view instanceof MarpPreviewView) {
        leaf.view.update(markdown)
      }
    })
  }
}
```

**Step 2: Implémenter le settings tab dans `settings.ts`**

Ajouter à la fin de `src/settings.ts` :

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian'
import type MarpidianPlugin from './main'

export class MarpidianSettingTab extends PluginSettingTab {
  plugin: MarpidianPlugin

  constructor(app: App, plugin: MarpidianPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Marpidian — settings' })

    containerEl.createEl('h3', { text: 'Themes' })
    containerEl.createEl('p', {
      text: 'Chemin relatif depuis la racine du vault. Format: nom → chemin/vers/theme.css',
      cls: 'setting-item-description',
    })

    this.plugin.settings.themes.forEach((entry, index) => {
      const row = containerEl.createDiv({ cls: 'marpidian-theme-row' })

      new Setting(row)
        .setName(`Thème ${index + 1}`)
        .addText((text) =>
          text
            .setPlaceholder('nom')
            .setValue(entry.name)
            .onChange(async (value) => {
              this.plugin.settings.themes[index].name = value
              await this.plugin.saveSettings()
            })
        )
        .addText((text) =>
          text
            .setPlaceholder('themes/mon-theme.css')
            .setValue(entry.path)
            .onChange(async (value) => {
              this.plugin.settings.themes[index].path = value
              await this.plugin.saveSettings()
            })
        )
        .addButton((btn) =>
          btn
            .setButtonText('Supprimer')
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.themes.splice(index, 1)
              await this.plugin.saveSettings()
              this.display()
            })
        )
    })

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText('Ajouter un thème')
        .setCta()
        .onClick(async () => {
          this.plugin.settings.themes.push({ name: '', path: '' })
          await this.plugin.saveSettings()
          this.display()
        })
    )
  }
}
```

**Step 3: Lancer les tests — vérifier que tout passe encore**

```bash
npm test
```

Expected: PASS — aucune régression.

**Step 4: Commit**

```bash
git add src/main.ts src/settings.ts
git commit -m "feat: add main plugin entry point and settings tab"
```

---

## Task 8 : Build et validation manuelle (hot-reload)

**Step 1: S'assurer que le dossier plugin est prêt dans le vault**

```bash
ls /home/harold/Workspace/brain/.obsidian/plugins/marpidian/
```

Expected: `manifest.json` présent.

**Step 2: Builder le plugin**

```bash
npm run build
```

Expected: `main.js` créé dans le dossier vault.

**Step 3: Activer le plugin dans Obsidian**

Dans Obsidian :
1. `Paramètres → Plugins communautaires → Plugins installés`
2. Activer "Marpidian"
3. Vérifier qu'aucune erreur n'apparaît dans la console (Ctrl+Shift+I)

**Step 4: Installer Hot Reload dans le vault**

Si pas encore installé : installer le plugin communautaire **"Hot Reload"** (pjeby).

**Step 5: Lancer le mode dev**

```bash
npm run dev
```

**Step 6: Créer un fichier de test dans le vault**

Créer `tmp/test-marp.md` dans le vault Obsidian avec ce contenu :

```markdown
---
marp: true
---

# Slide 1

Bonjour depuis Marpidian !

---

# Slide 2

Le split preview fonctionne.
```

**Step 7: Vérifier l'effet "waouh"**

Ouvrir `tmp/test-marp.md` dans Obsidian. Le panneau de preview Marp doit s'ouvrir automatiquement à droite, avec les deux slides rendus.

**Step 8: Tester le live-reload**

Modifier le contenu de `tmp/test-marp.md` (ajouter une slide). La preview doit se mettre à jour dans les 300ms.

**Step 9: Commit final**

```bash
git add .
git commit -m "feat: marpidian MVP — live preview with theme registry"
```

---

## Récapitulatif des commits attendus

```
chore: initial project scaffold
test: add obsidian mock and vitest config
feat: add detectMarpDocument and debounce utils
feat: add MarpidianSettings types and mergeSettings
feat: add Themes registry with hot-reload support
feat: add MarpPreviewView ItemView with iframe rendering
feat: add main plugin entry point and settings tab
feat: marpidian MVP — live preview with theme registry
```

---

## Références

- marp-team/marp-vscode — référence principale d'implémentation
- obsidianmd/obsidian-sample-plugin — scaffolding de départ
- docs.obsidian.md/plugins — API Obsidian
- @marp-team/marp-core — moteur de rendu
