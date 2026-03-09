import { Plugin, MarkdownView } from 'obsidian'
import { MarpPreviewView, VIEW_TYPE_MARP } from './MarpPreviewView'
import { MarpidianSettingTab } from './settings'
import { Themes } from './Themes'
import { detectMarpDocument, debounce } from './utils'
import { mergeSettings } from './settings'
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

  async saveSettings(reloadThemes = true): Promise<void> {
    await this.saveData(this.settings)
    if (reloadThemes) await this.loadThemes()
  }

  private async loadThemes(): Promise<void> {
    this.themes.dispose()
    for (const entry of this.settings.themes) {
      try {
        await this.themes.loadTheme(entry.path)
      } catch {
        console.warn('[Marpidian] Impossible de charger le thème:', entry.path)
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
    } else {
      this.app.workspace.getLeavesOfType(VIEW_TYPE_MARP).forEach((leaf) => leaf.detach())
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
