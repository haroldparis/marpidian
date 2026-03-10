export interface ThemeEntry {
  path: string
}

export interface MarpidianSettings {
  themes: ThemeEntry[]
  themesFolder: string
  exportDir: string
}

export const DEFAULT_SETTINGS: MarpidianSettings = {
  themes: [],
  themesFolder: '.marpidian',
  exportDir: '.marpidian-exports',
}

export function mergeSettings(saved: Partial<MarpidianSettings>): MarpidianSettings {
  return {
    themes: Array.isArray(saved.themes) ? saved.themes : DEFAULT_SETTINGS.themes,
    themesFolder: typeof saved.themesFolder === 'string' ? saved.themesFolder : DEFAULT_SETTINGS.themesFolder,
    exportDir: typeof saved.exportDir === 'string' ? saved.exportDir : DEFAULT_SETTINGS.exportDir,
  }
}

import { App, Modal, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian'
import type MarpidianPlugin from './main'

class ConfirmDeleteModal extends Modal {
  private themeName: string
  private onConfirm: () => void

  constructor(app: App, themeName: string, onConfirm: () => void) {
    super(app)
    this.themeName = themeName
    this.onConfirm = onConfirm
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.createEl('h3', { text: 'Supprimer le thème' })
    contentEl.createEl('p', {
      text: `Supprimer "${this.themeName}" et son fichier CSS du vault ?`,
    })

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Annuler')
          .onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText('Supprimer')
          .setWarning()
          .onClick(() => {
            this.close()
            this.onConfirm()
          })
      )
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

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
      .setDesc('Dossier cible pour les nouveaux imports (les thèmes existants ne sont pas déplacés).')
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

    // — Dossier d'export —
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

    // — Thèmes installés —
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
          btn.setTooltip('Supprimer')
          setIcon(btn.buttonEl, 'trash')
          btn.setWarning()
          btn.onClick(() => {
            new ConfirmDeleteModal(this.plugin.app, name, async () => {
              try {
                await this.plugin.app.vault.adapter.remove(entry.path)
              } catch (e: any) {
                if (!e?.message?.includes('ENOENT') && !e?.message?.includes('no such file')) {
                  new Notice(`[Marpidian] Erreur lors de la suppression : ${e?.message ?? e}`)
                  return
                }
              }
              this.plugin.settings.themes = this.plugin.settings.themes.filter(
                (t) => t.path !== entry.path
              )
              await this.plugin.saveSettings(true)
              this.display()
            }).open()
          })
        })
    })

    // — Import —
    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText('Importer un thème')
        .setCta()
        .onClick(() => this.plugin.importTheme(() => this.display()))
    )
  }

  private getThemeDisplayName(path: string): string {
    return path.split('/').pop()?.replace(/\.css$/, '') ?? path
  }
}
