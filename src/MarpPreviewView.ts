import { ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Themes } from './Themes'
import type { MarpidianSettings } from './settings'

export const VIEW_TYPE_MARP = 'marpidian-preview'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''
  private getSettings: () => MarpidianSettings

  constructor(leaf: WorkspaceLeaf, themes: Themes, getSettings: () => MarpidianSettings) {
    super(leaf)
    this.themes = themes
    this.getSettings = getSettings
  }

  getViewType(): string {
    return VIEW_TYPE_MARP
  }

  getDisplayText(): string {
    return 'Marpidian'
  }

  getIcon(): string {
    return 'presentation'
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty()
    this.contentEl.style.cssText = 'padding: 0; overflow: hidden; height: 100%;'

    this.addAction('file-down', 'Exporter en PDF', () => { void this.exportPdf() })
    this.addAction('image-down', 'Exporter en PNG', () => { void this.exportPng() })

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
    this.render()
  }

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
        pageSize: { width: 338667, height: 190500 },
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

  private async exportPng(): Promise<void> {
    new Notice('[Marpidian] Export PNG — bientôt disponible.')
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
    body { background: ${getComputedStyle(document.body).getPropertyValue('--background-primary').trim() || '#888'}; overflow-y: auto; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`
  }
}
