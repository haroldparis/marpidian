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
              await this.plugin.saveSettings(false)
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
