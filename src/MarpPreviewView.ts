import { ItemView, Notice, WorkspaceLeaf } from 'obsidian'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Themes } from './Themes'
import type { MarpidianSettings } from './settings'

// Dimensions d'une slide Marp 16:9 en micromètres (unité Chromium : 1 in = 25400 µm)
const SLIDE_WIDTH_UM = 338667   // ≈ 33.87 cm
const SLIDE_HEIGHT_UM = 190500  // ≈ 19.05 cm

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
      try {
        await win.loadURL(`file://${tmpPath}`)
        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: { width: SLIDE_WIDTH_UM, height: SLIDE_HEIGHT_UM },
        })
        const result = await dialog.showSaveDialog({
          defaultPath: 'presentation.pdf',
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (!result.canceled && result.filePath) {
          await writeFile(result.filePath, pdfBuffer)
          new Notice('[Marpidian] PDF exporté.')
        }
      } finally {
        win.destroy()
      }
    } catch (e: any) {
      new Notice(`[Marpidian] Échec de l'export PDF : ${e?.message ?? e}`)
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  }

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
    const vaultBase: string = adapter.basePath ?? adapter.getBasePath?.() ?? ''

    if (!vaultBase) {
      new Notice('[Marpidian] Impossible de déterminer le chemin du vault.')
      return
    }

    const outputDir = join(vaultBase, settings.exportDir, basename)
    const tmpPath = join(tmpdir(), `marpidian-export-${Date.now()}.html`)

    try {
      await mkdir(outputDir, { recursive: true })
      await writeFile(tmpPath, this.buildExportHtml(), 'utf-8')

      const win = new BrowserWindow({ show: false, width: 1280, height: 720 })
      try {
        await win.loadURL(`file://${tmpPath}`)

        const slideCount: number = await win.webContents.executeJavaScript(
          'document.querySelectorAll("section").length'
        )

        if (slideCount === 0) {
          new Notice('[Marpidian] Aucune slide détectée.')
          return
        }

        for (let i = 0; i < slideCount; i++) {
          await win.webContents.executeJavaScript(`window.scrollTo(0, ${i * 720})`)
          const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 720 })
          await writeFile(join(outputDir, `${i + 1}.png`), image.toPNG())
        }

        new Notice(`[Marpidian] ${slideCount} slide(s) exportée(s) dans ${settings.exportDir}/${basename}/`)
      } finally {
        win.destroy()
      }
    } catch (e: any) {
      new Notice(`[Marpidian] Échec de l'export PNG : ${e?.message ?? e}`)
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
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
