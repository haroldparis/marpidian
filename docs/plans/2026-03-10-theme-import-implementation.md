# Theme import implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer la saisie manuelle de thèmes par un import via file picker, avec détection automatique du nom, gestion des conflits, et UI Obsidian native (crayon, corbeille, révéler le dossier).

**Architecture:** Refactoring du modèle (`ThemeEntry` sans `name`, `themesFolder` dans settings) + nouveau utilitaire `extractThemeName` + import flow dans `main.ts` + refactoring complet du settings tab dans `settings.ts`.

**Tech Stack:** TypeScript · API Obsidian · `electron.shell` · `FileReader` (Web API) · Vitest

---

## Avant de commencer

Lis le design doc :
```
docs/plans/2026-03-10-theme-import-design.md
```

---

## Task 1 : Refactoring du modèle de données

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/settings.test.ts`
- Modify: `src/main.ts`

### Step 1 : Mettre à jour les tests de settings

Remplacer le contenu de `src/settings.test.ts` :

```typescript
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
})
```

### Step 2 : Vérifier que les tests échouent

```bash
npm test
```

Expected: FAIL — `themesFolder` manquant.

### Step 3 : Mettre à jour `src/settings.ts` (types uniquement, pas le SettingTab)

```typescript
export interface ThemeEntry {
  path: string
}

export interface MarpidianSettings {
  themes: ThemeEntry[]
  themesFolder: string
}

export const DEFAULT_SETTINGS: MarpidianSettings = {
  themes: [],
  themesFolder: '.marpidian',
}

export function mergeSettings(saved: Partial<MarpidianSettings>): MarpidianSettings {
  return {
    themes: Array.isArray(saved.themes) ? saved.themes : DEFAULT_SETTINGS.themes,
    themesFolder: typeof saved.themesFolder === 'string' ? saved.themesFolder : DEFAULT_SETTINGS.themesFolder,
  }
}
```

Garder `MarpidianSettingTab` en place (sera remplacé en Task 4) mais supprimer les références à `entry.name`.

### Step 4 : Mettre à jour `src/main.ts`

Retirer `entry.name` de l'appel à `loadTheme` (déjà fait) — vérifier qu'il n'y a plus de référence à `.name` sur `ThemeEntry`.

### Step 5 : Vérifier que les tests passent

```bash
npm test
```

Expected: PASS — tous les tests verts.

### Step 6 : Commit

```bash
git add src/settings.ts src/settings.test.ts src/main.ts
git commit -m "refactor: remove ThemeEntry.name, add themesFolder setting"
```

---

## Task 2 : extractThemeName utility (TDD)

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/utils.test.ts`

### Step 1 : Ajouter les tests

Dans `src/utils.test.ts`, ajouter après les tests existants :

```typescript
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
```

Mettre à jour l'import :
```typescript
import { detectMarpDocument, debounce, extractThemeName } from './utils'
```

### Step 2 : Vérifier que les tests échouent

```bash
npm test
```

Expected: FAIL — `extractThemeName` non exportée.

### Step 3 : Implémenter dans `src/utils.ts`

Ajouter à la fin :

```typescript
/**
 * Extracts the theme name from a Marp CSS file.
 * Returns null if no @theme directive is found.
 */
export function extractThemeName(css: string): string | null {
  const match = css.match(/\/\*\s*@theme\s+(\S+)/)
  return match ? match[1] : null
}
```

### Step 4 : Vérifier que les tests passent

```bash
npm test
```

Expected: PASS — tous les tests verts.

### Step 5 : Commit

```bash
git add src/utils.ts src/utils.test.ts
git commit -m "feat: add extractThemeName utility"
```

---

## Task 3 : importTheme dans main.ts

**Files:**
- Modify: `src/main.ts`

Pas de tests unitaires sur cette task : le flow dépend de `FileReader` et `electron.shell` qui ne sont pas disponibles dans Vitest. Validation manuelle en Task 5.

### Step 1 : Ajouter l'import electron en haut de `main.ts`

```typescript
import { shell } from 'electron'
```

### Step 2 : Ajouter la méthode `importTheme` dans `MarpidianPlugin`

```typescript
async importTheme(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.css'

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const css = await file.text()
    const themeName = extractThemeName(css)

    if (!themeName) {
      new Notice('[Marpidian] Ce fichier CSS ne contient pas de directive @theme.')
      return
    }

    const existingNames = await this.getInstalledThemeNames()
    if (existingNames.includes(themeName)) {
      new Notice(`[Marpidian] Un thème "${themeName}" est déjà installé.`)
      return
    }

    const destPath = `${this.settings.themesFolder}/${file.name}`
    const existingPaths = this.settings.themes.map(t => t.path)
    if (existingPaths.includes(destPath)) {
      new Notice(`[Marpidian] Le fichier "${file.name}" est déjà importé.`)
      return
    }

    await this.app.vault.adapter.mkdir(this.settings.themesFolder)
    await this.app.vault.adapter.write(destPath, css)

    this.settings.themes.push({ path: destPath })
    await this.saveSettings(true)
    new Notice(`[Marpidian] Thème "${themeName}" importé.`)
  }

  input.click()
}
```

### Step 3 : Ajouter la méthode `getInstalledThemeNames`

```typescript
private async getInstalledThemeNames(): Promise<string[]> {
  const names: string[] = []
  for (const entry of this.settings.themes) {
    try {
      const css = await this.app.vault.adapter.read(entry.path)
      const name = extractThemeName(css)
      if (name) names.push(name)
    } catch {
      // fichier manquant — ignoré
    }
  }
  return names
}
```

### Step 4 : Ajouter `revealThemesFolder` et `openThemeInEditor`

```typescript
revealThemesFolder(): void {
  const adapter = this.app.vault.adapter as any
  const basePath = adapter.basePath ?? adapter.getBasePath?.() ?? ''
  const absPath = `${basePath}/${this.settings.themesFolder}`
  shell.showItemInFolder(absPath)
}

openThemeInEditor(themeRelativePath: string): void {
  const adapter = this.app.vault.adapter as any
  const basePath = adapter.basePath ?? adapter.getBasePath?.() ?? ''
  shell.openPath(`${basePath}/${themeRelativePath}`)
}
```

### Step 5 : Ajouter l'import manquant en haut de `main.ts`

```typescript
import { Plugin, MarkdownView, Notice } from 'obsidian'
```

Vérifier que `extractThemeName` est importé depuis `./utils`.

### Step 6 : Vérifier que les tests passent

```bash
npm test
```

Expected: PASS — aucune régression.

### Step 7 : Commit

```bash
git add src/main.ts
git commit -m "feat: add importTheme, revealThemesFolder, openThemeInEditor"
```

---

## Task 4 : Refactoring du settings tab

**Files:**
- Modify: `src/settings.ts`

Remplacer entièrement la classe `MarpidianSettingTab` dans `src/settings.ts` :

### Step 1 : Remplacer `MarpidianSettingTab.display()`

```typescript
export class MarpidianSettingTab extends PluginSettingTab {
  plugin: MarpidianPlugin

  constructor(app: App, plugin: MarpidianPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Marpidian' })

    // — Dossier des thèmes —
    new Setting(containerEl)
      .setName('Dossier des thèmes')
      .setDesc('Chemin relatif depuis la racine du vault.')
      .addText((text) =>
        text
          .setPlaceholder('.marpidian')
          .setValue(this.plugin.settings.themesFolder)
          .onChange(async (value) => {
            this.plugin.settings.themesFolder = value.trim() || '.marpidian'
            await this.plugin.saveSettings(false)
          })
      )
      .addButton((btn) => {
        btn.setTooltip('Révéler dans le gestionnaire de fichiers')
        setIcon(btn.buttonEl, 'folder-open')
        btn.onClick(() => this.plugin.revealThemesFolder())
      })

    // — Liste des thèmes installés —
    containerEl.createEl('h3', { text: 'Thèmes installés' })

    if (this.plugin.settings.themes.length === 0) {
      containerEl.createEl('p', {
        text: 'Aucun thème installé.',
        cls: 'setting-item-description',
      })
    }

    this.plugin.settings.themes.forEach((entry, index) => {
      const name = this.getThemeDisplayName(entry.path)

      new Setting(containerEl)
        .setName(name)
        .setDesc(entry.path)
        .addButton((btn) => {
          btn.setTooltip('Ouvrir dans l\'éditeur')
          setIcon(btn.buttonEl, 'pencil')
          btn.onClick(() => this.plugin.openThemeInEditor(entry.path))
        })
        .addButton((btn) => {
          btn.setTooltip('Supprimer')
          setIcon(btn.buttonEl, 'trash')
          btn.setWarning()
          btn.onClick(async () => {
            try {
              await this.plugin.app.vault.adapter.remove(entry.path)
            } catch {
              // fichier déjà absent — ok
            }
            this.plugin.settings.themes.splice(index, 1)
            await this.plugin.saveSettings(true)
            this.display()
          })
        })
    })

    // — Import —
    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText('Importer un thème')
        .setCta()
        .onClick(() => this.plugin.importTheme())
    )
  }

  private getThemeDisplayName(path: string): string {
    // Extrait le nom du fichier comme fallback (nom CSS peut ne pas encore être en cache)
    return path.split('/').pop()?.replace(/\.css$/, '') ?? path
  }
}
```

Ajouter l'import manquant en haut du fichier (après les imports existants) :
```typescript
import { setIcon } from 'obsidian'
```

### Step 2 : Vérifier que les tests passent

```bash
npm test
```

Expected: PASS — aucune régression.

### Step 3 : Commit

```bash
git add src/settings.ts
git commit -m "feat: refactor settings tab with import/reveal/edit UI"
```

---

## Task 5 : Build et validation manuelle

### Step 1 : Builder

```bash
npm run build
```

Expected: `main.js` créé sans erreur.

### Step 2 : Valider dans Obsidian (hot-reload actif)

1. Ouvrir les settings Marpidian → vérifier la nouvelle UI
2. Modifier le dossier → vérifier que la valeur persiste après rechargement
3. Cliquer "Importer un thème" → file picker s'ouvre → sélectionner un CSS avec `/* @theme */`
4. Vérifier que le thème apparaît dans la liste
5. Vérifier que le bouton crayon ouvre l'éditeur par défaut
6. Cliquer le bouton dossier → Finder/Nautilus s'ouvre sur `.marpidian/`
7. Tester le conflit : importer le même thème deux fois → Notice d'erreur
8. Supprimer un thème → disparaît de la liste + fichier retiré du vault
9. Ouvrir un fichier Marp avec `theme: einstein` → preview avec le bon thème

### Step 3 : Commit final

```bash
git add .
git commit -m "feat: theme import MVP — file picker, auto-detect, conflict check"
git push
```

---

## Récapitulatif des commits

```
refactor: remove ThemeEntry.name, add themesFolder setting
feat: add extractThemeName utility
feat: add importTheme, revealThemesFolder, openThemeInEditor
feat: refactor settings tab with import/reveal/edit UI
feat: theme import MVP — file picker, auto-detect, conflict check
```
