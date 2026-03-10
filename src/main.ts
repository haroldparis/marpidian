import { spawnSync } from 'node:child_process'
import { FileView, MarkdownView, Notice, Plugin, type TFile } from 'obsidian'
import { FileExplorerDecorator } from './FileExplorerDecorator'
import { MarpPreviewView, VIEW_TYPE_MARP } from './MarpPreviewView'
import { MarpidianSettingTab } from './SettingTab'
import type { MarpidianSettings } from './settings'
import { mergeSettings } from './settings'
import { Themes } from './Themes'
import {
  debounce,
  detectMarpDocument,
  extractThemeName,
  getVaultBasePath,
} from './utils'

export default class MarpidianPlugin extends Plugin {
  settings: MarpidianSettings
  themes: Themes
  marpCliAvailable = false
  private decorator: FileExplorerDecorator

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

    this.marpCliAvailable =
      spawnSync('marp', ['--version'], { timeout: 2000, stdio: 'ignore' })
        .status === 0

    this.decorator = new FileExplorerDecorator(this.app)

    this.registerView(
      VIEW_TYPE_MARP,
      (leaf) =>
        new MarpPreviewView(
          leaf,
          this.themes,
          () => this.settings,
          this.marpCliAvailable
        )
    )

    this.addCommand({
      id: 'toggle-marp-preview',
      name: 'Toggle Marp preview',
      callback: () => this.togglePreview(),
    })

    this.app.workspace.onLayoutReady(() => {
      this.decorator.decorate()

      this.registerEvent(
        this.app.workspace.on('active-leaf-change', () =>
          this.onActiveLeafChange()
        )
      )

      this.registerEvent(
        this.app.workspace.on(
          'editor-change',
          debounce(() => this.onEditorChange(), 300)
        )
      )

      // Changements de frontmatter via le panneau de propriétés Obsidian :
      // ne déclenchent pas editor-change, seulement metadataCache.
      this.registerEvent(
        this.app.metadataCache.on('changed', (file) => {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
          if (!activeView || activeView.file?.path !== file.path) return
          const content = activeView.editor.getValue()
          if (detectMarpDocument(content)) {
            void this.openPreview()
            this.updatePreview(content, activeView.file)
          } else {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP).forEach((leaf) => leaf.detach())
          }
        })
      )

      // Passe initiale au démarrage : cherche un fichier Marp ouvert parmi
      // toutes les feuilles (sans dépendre de activeLeaf, qui peut être la
      // preview elle-même lors d'une session restaurée).
      const marpView = this.app.workspace
        .getLeavesOfType('markdown')
        .map((leaf) => leaf.view)
        .find(
          (view): view is MarkdownView =>
            view instanceof MarkdownView &&
            view.file !== null &&
            Boolean(this.app.metadataCache.getFileCache(view.file)?.frontmatter?.marp)
        )
      if (marpView) {
        void this.openPreview().then(() =>
          this.updatePreview(marpView.editor.getValue(), marpView.file)
        )
      }
    })

    this.addSettingTab(new MarpidianSettingTab(this.app, this))
  }

  async onunload(): Promise<void> {
    this.themes.dispose()
    this.decorator.dispose()
  }

  async saveSettings(reloadThemes = true): Promise<void> {
    await this.saveData(this.settings)
    if (reloadThemes) {
      await this.loadThemes()
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
      if (activeView)
        this.updatePreview(activeView.editor.getValue(), activeView.file)
    }
  }

  async importTheme(onImported?: () => void): Promise<void> {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.css'

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      const css = await file.text()
      const themeName = extractThemeName(css)

      if (!themeName) {
        new Notice(
          '[Marpidian] Ce fichier CSS ne contient pas de directive @theme.'
        )
        return
      }

      const existingNames = await this.getInstalledThemeNames()
      if (existingNames.includes(themeName)) {
        new Notice(`[Marpidian] Un thème "${themeName}" est déjà installé.`)
        return
      }

      const destPath = `${this.settings.themesFolder}/${file.name}`
      const existingPaths = this.settings.themes.map((t) => t.path)
      if (existingPaths.includes(destPath)) {
        new Notice(`[Marpidian] Le fichier "${file.name}" est déjà importé.`)
        return
      }

      await this.app.vault.adapter.mkdir(this.settings.themesFolder)
      await this.app.vault.adapter.write(destPath, css)

      this.settings.themes.push({ path: destPath })
      await this.saveSettings(true)
      new Notice(`[Marpidian] Thème "${themeName}" importé.`)
      onImported?.()
    }

    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }

  async revealThemesFolder(): Promise<void> {
    const basePath = getVaultBasePath(this.app.vault.adapter)
    if (!basePath) {
      new Notice('[Marpidian] Impossible de déterminer le chemin du vault.')
      return
    }
    await this.app.vault.adapter.mkdir(this.settings.themesFolder)
    const absPath = `${basePath}/${this.settings.themesFolder}`
    const { shell } = require('electron') as typeof import('electron')
    const error = await shell.openPath(absPath)
    if (error)
      new Notice(`[Marpidian] Impossible d'ouvrir le dossier : ${error}`)
  }

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

  private async loadThemes(): Promise<void> {
    this.themes.dispose()
    // Recâbler le callback de hot-reload après chaque dispose/reload
    this.themes.setOnUpdate(() => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
      if (activeView)
        this.updatePreview(activeView.editor.getValue(), activeView.file)
    })
    for (const entry of this.settings.themes) {
      try {
        await this.themes.loadTheme(entry.path)
      } catch {
        console.warn('[Marpidian] Impossible de charger le thème:', entry.path)
      }
    }
  }

  private async onActiveLeafChange(): Promise<void> {
    const activeView = this.app.workspace.activeLeaf?.view

    // Ignorer les panneaux qui ne représentent pas un fichier ouvert
    // (explorateur, recherche, tags, outline…) : ils ne sont pas des FileView.
    if (!(activeView instanceof FileView)) return

    // Si c'est la vue Marpidian elle-même, ne pas agir :
    // l'utilisateur interagit avec la preview (ex. boutons d'export).
    if (activeView.getViewType() === VIEW_TYPE_MARP) return

    if (activeView instanceof MarkdownView) {
      const content = activeView.editor.getValue()
      const file = activeView.file // capturé avant le await pour éviter la race condition
      if (detectMarpDocument(content)) {
        await this.openPreview()
        this.updatePreview(content, file)
        return
      }
    }

    // FileView non-Marp (autre .md, .base, image, PDF…) → fermer la pane
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP).forEach((leaf) => {
      leaf.detach()
    })
  }

  private onEditorChange(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!activeView) return

    const content = activeView.editor.getValue()
    if (!detectMarpDocument(content)) return

    this.updatePreview(content, activeView.file)
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
      existing.forEach((leaf) => {
        leaf.detach()
      })
    } else {
      await this.openPreview()
    }
  }

  private updatePreview(markdown: string, file: TFile | null): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP).forEach((leaf) => {
      if (leaf.view instanceof MarpPreviewView) {
        leaf.view.update(markdown, file)
      }
    })
  }
}
