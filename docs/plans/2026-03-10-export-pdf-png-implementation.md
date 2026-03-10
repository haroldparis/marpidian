# Export PDF + PNG — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter deux boutons d'export (PDF et PNG par slide) dans le header de la vue Marpidian, avec un dossier d'export configurable dans les settings.

**Architecture:** `@electron/remote` crée une `BrowserWindow` cachée qui charge le HTML Marp depuis un fichier temporaire. Pour le PDF, `printToPDF()` + save dialog. Pour le PNG, `capturePage()` par slide (scroll + capture 1280×720 pour chaque section). `MarpPreviewView` reçoit un getter `() => MarpidianSettings` pour éviter la dépendance circulaire avec `main.ts`.

**Tech Stack:** TypeScript · Obsidian Plugin API · Electron (`@electron/remote`, `shell`) · Node.js builtins (`fs/promises`, `os`, `path`) · Vitest

---

### Task 1 : Renommage + setting exportDir + getter settings dans la vue

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/MarpPreviewView.ts`
- Modify: `src/main.ts`
- Test: `src/settings.test.ts`

**Step 1 : Écrire le test qui échoue**

Dans `src/settings.test.ts`, ajouter dans `describe('mergeSettings')` :

```typescript
it('utilise exportDir sauvegardé si string', () => {
  expect(mergeSettings({ exportDir: 'my-exports' }).exportDir).toBe('my-exports')
})

it('utilise la valeur par défaut si exportDir absent', () => {
  expect(mergeSettings({}).exportDir).toBe('.marpidian-exports')
})
```

**Step 2 : Vérifier que le test échoue**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A3 "exportDir"
```

Expected: FAIL — `exportDir` n'existe pas encore.

**Step 3 : Implémenter dans `src/settings.ts`**

Ajouter `exportDir` à l'interface et aux fonctions :

```typescript
export interface MarpidianSettings {
  themes: ThemeEntry[]
  themesFolder: string
  exportDir: string          // nouveau
}

export const DEFAULT_SETTINGS: MarpidianSettings = {
  themes: [],
  themesFolder: '.marpidian',
  exportDir: '.marpidian-exports',  // nouveau
}

export function mergeSettings(saved: Partial<MarpidianSettings>): MarpidianSettings {
  return {
    themes: Array.isArray(saved.themes) ? saved.themes : DEFAULT_SETTINGS.themes,
    themesFolder: typeof saved.themesFolder === 'string' ? saved.themesFolder : DEFAULT_SETTINGS.themesFolder,
    exportDir: typeof saved.exportDir === 'string' ? saved.exportDir : DEFAULT_SETTINGS.exportDir,  // nouveau
  }
}
```

Dans `MarpidianSettingTab.display()`, ajouter après le bloc "Dossier des thèmes" :

```typescript
new Setting(containerEl)
  .setName("Dossier d'export")
  .setDesc('Dossier cible pour les exports PDF et PNG (chemin relatif depuis la racine du vault).')
  .addText((text) =>
    text
      .setPlaceholder('.marpidian-exports')
      .setValue(this.plugin.settings.exportDir)
      .onChange(async (value) => {
        this.plugin.settings.exportDir = value.trim() || '.marpidian-exports'
        await this.plugin.saveSettings(false)
      })
  )
```

**Step 4 : Mettre à jour `src/MarpPreviewView.ts`**

Ajouter l'import du type settings et modifier le constructeur :

```typescript
import type { MarpidianSettings } from './settings'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''
  private getSettings: () => MarpidianSettings  // nouveau

  constructor(leaf: WorkspaceLeaf, themes: Themes, getSettings: () => MarpidianSettings) {
    super(leaf)
    this.themes = themes
    this.getSettings = getSettings  // nouveau
  }

  getDisplayText(): string {
    return 'Marpidian'  // renommé (était 'Marp Preview')
  }
  // ... reste inchangé
}
```

**Step 5 : Mettre à jour `src/main.ts`**

Passer le getter à la factory de la vue :

```typescript
this.registerView(VIEW_TYPE_MARP, (leaf) => new MarpPreviewView(leaf, this.themes, () => this.settings))
```

**Step 6 : Vérifier que les tests passent**

```bash
npm test
```

Expected: 27 tests passing (25 existants + 2 nouveaux).

**Step 7 : Commit**

```bash
git add src/settings.ts src/MarpPreviewView.ts src/main.ts src/settings.test.ts
git commit -m "feat: add exportDir setting, rename view to Marpidian, pass settings getter to view"
```

---

### Task 2 : Export PDF

**Files:**
- Modify: `src/MarpPreviewView.ts`

**Context:**

`@electron/remote` est disponible dans Obsidian (Electron avec nodeIntegration). On crée une `BrowserWindow` cachée, on charge le HTML Marp depuis un fichier temporaire (évite les limites de data URI), on appelle `printToPDF()`, puis `dialog.showSaveDialog()` pour choisir la destination.

Le HTML d'export **ne doit PAS** inclure la couleur de fond Obsidian (`--background-primary`) — les slides gèrent leur propre fond. On utilise un body neutre.

**Step 1 : Ajouter les imports Node dans `src/MarpPreviewView.ts`**

```typescript
import { writeFile, unlink, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
```

Ces modules sont dans les externals esbuild (via `builtin-modules`), pas besoin de modifier la config.

**Step 2 : Ajouter la méthode `buildExportHtml()` (HTML sans fond Obsidian)**

Dans `MarpPreviewView`, ajouter une méthode privée :

```typescript
private buildExportHtml(): string {
  const marp = this.themes.getMarpInstance()
  const { html, css } = marp.render(this.currentMarkdown)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`
}
```

**Step 3 : Ajouter la méthode `exportPdf()`**

```typescript
private async exportPdf(): Promise<void> {
  if (!this.currentMarkdown) {
    new Notice('[Marpidian] Aucun contenu à exporter.')
    return
  }

  let remote: any
  try {
    remote = require('@electron/remote')
  } catch {
    new Notice('[Marpidian] Export PDF indisponible : @electron/remote introuvable.')
    return
  }

  const { BrowserWindow, dialog } = remote
  const tmpPath = join(tmpdir(), `marpidian-export-${Date.now()}.html`)

  try {
    await writeFile(tmpPath, this.buildExportHtml(), 'utf-8')

    const win = new BrowserWindow({ show: false, width: 1280, height: 720 })
    await win.loadURL(`file://${tmpPath}`)

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: 33866, height: 19050 },  // 1280×720px en microns (16:9)
    })
    win.destroy()

    const result = await dialog.showSaveDialog({
      defaultPath: 'presentation.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, pdfBuffer)
      new Notice('[Marpidian] PDF exporté.')
    }
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
```

> Note sur `pageSize` : les dimensions sont en microns. 1280px × 720px @ 96 dpi = 338.67mm × 190.5mm = 338667 × 190500 microns. Valeurs arrondies : `{ width: 338667, height: 190500 }`. Ajuster si les slides ont un ratio différent (4:3 = 254000 × 190500).

**Step 4 : Enregistrer l'action dans `onOpen()`**

```typescript
async onOpen(): Promise<void> {
  this.contentEl.empty()
  this.contentEl.style.cssText = 'padding: 0; overflow: hidden; height: 100%;'

  this.addAction('file-down', 'Exporter en PDF', () => { void this.exportPdf() })  // nouveau
  this.addAction('image-down', 'Exporter en PNG', () => { void this.exportPng() }) // Task 3

  this.iframe = this.contentEl.createEl('iframe', {
    attr: {
      style: 'width: 100%; height: 100%; border: none; background: white;',
      sandbox: 'allow-scripts allow-same-origin',
    },
  })

  this.render()
}
```

**Step 5 : Build de vérification**

```bash
npm run build
```

Expected: build sans erreur.

**Step 6 : Validation manuelle dans Obsidian**

1. Ouvrir une note Marp, vérifier que la vue s'appelle "Marpidian"
2. Vérifier que les icônes `file-down` et `image-down` apparaissent dans le header (PNG sera non fonctionnel jusqu'à Task 3)
3. Cliquer sur PDF → save dialog → vérifier que le PDF généré contient les bonnes slides

**Step 7 : Commit**

```bash
git add src/MarpPreviewView.ts
git commit -m "feat: add PDF export via hidden BrowserWindow + printToPDF"
```

---

### Task 3 : Export PNG par slide

**Files:**
- Modify: `src/MarpPreviewView.ts`

**Context:**

Pour chaque slide : scroll dans la BrowserWindow cachée à `y = i × 720`, capturer la fenêtre (1280×720) avec `capturePage()`. La `NativeImage` retournée a une méthode `.toPNG()`. Les fichiers sont écrits dans `{vault}/{exportDir}/{basename}/1.png`, `2.png`, etc.

**Step 1 : Ajouter la méthode `exportPng()`**

```typescript
private async exportPng(): Promise<void> {
  if (!this.currentMarkdown) {
    new Notice('[Marpidian] Aucun contenu à exporter.')
    return
  }

  let remote: any
  try {
    remote = require('@electron/remote')
  } catch {
    new Notice('[Marpidian] Export PNG indisponible : @electron/remote introuvable.')
    return
  }

  const { BrowserWindow } = remote
  const settings = this.getSettings()
  const activeFile = this.app.workspace.getActiveFile()
  const basename = activeFile?.basename ?? 'untitled'
  const adapter = this.app.vault.adapter as any
  const vaultBase = adapter.basePath ?? adapter.getBasePath?.() ?? ''

  if (!vaultBase) {
    new Notice('[Marpidian] Impossible de déterminer le chemin du vault.')
    return
  }

  const outputDir = join(vaultBase, settings.exportDir, basename)
  await mkdir(outputDir, { recursive: true })

  const tmpPath = join(tmpdir(), `marpidian-export-${Date.now()}.html`)

  try {
    await writeFile(tmpPath, this.buildExportHtml(), 'utf-8')

    const win = new BrowserWindow({ show: false, width: 1280, height: 720 })
    await win.loadURL(`file://${tmpPath}`)

    const slideCount: number = await win.webContents.executeJavaScript(
      'document.querySelectorAll("section").length'
    )

    if (slideCount === 0) {
      new Notice('[Marpidian] Aucune slide détectée.')
      win.destroy()
      return
    }

    for (let i = 0; i < slideCount; i++) {
      await win.webContents.executeJavaScript(`window.scrollTo(0, ${i * 720})`)
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 720 })
      await writeFile(join(outputDir, `${i + 1}.png`), image.toPNG())
    }

    win.destroy()
    new Notice(`[Marpidian] ${slideCount} slide(s) exportée(s) dans ${settings.exportDir}/${basename}/`)
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
```

**Step 2 : Build de vérification**

```bash
npm run build
```

Expected: build sans erreur.

**Step 3 : Validation manuelle dans Obsidian**

1. Cliquer sur `image-down` → attendre la Notice de succès
2. Vérifier dans `{vault}/.marpidian-exports/{nom-fichier}/` que les PNG sont présents
3. Vérifier qu'il y a autant de PNG que de slides
4. Ouvrir quelques PNG pour vérifier le rendu (fond, texte, thème)

**Step 4 : Commit**

```bash
git add src/MarpPreviewView.ts
git commit -m "feat: add PNG export per slide via hidden BrowserWindow + capturePage"
```

---

### Task 4 : Push et validation finale

**Step 1 : Lancer tous les tests**

```bash
npm test
```

Expected: tous les tests passent (27+).

**Step 2 : Build final**

```bash
npm run build
```

Expected: `main.js` généré sans erreur.

**Step 3 : Checklist de validation manuelle**

- [ ] Vue s'appelle "Marpidian" (plus "Marp Preview")
- [ ] Setting "Dossier d'export" visible et fonctionnel dans les settings Marpidian
- [ ] Icône `file-down` dans le header → save dialog PDF → PDF correct
- [ ] Icône `image-down` dans le header → PNG par slide dans le bon dossier
- [ ] Nommage des fichiers : `1.png`, `2.png`, pas `01.png`
- [ ] Dossier créé automatiquement si inexistant
- [ ] Notice d'erreur claire si aucun contenu

**Step 4 : Push**

```bash
git push
```
