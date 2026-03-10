import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, rename, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import type { Themes } from './Themes'
import type { MarpidianSettings } from './settings'

const execFileAsync = promisify(execFile)


export const VIEW_TYPE_MARP = 'marpidian-preview'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''
  private currentFile: TFile | null = null
  private getSettings: () => MarpidianSettings
  private marpCliAvailable: boolean

  constructor(leaf: WorkspaceLeaf, themes: Themes, getSettings: () => MarpidianSettings, marpCliAvailable: boolean) {
    super(leaf)
    this.themes = themes
    this.getSettings = getSettings
    this.marpCliAvailable = marpCliAvailable
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

    if (this.marpCliAvailable) {
      this.addAction('file-down', 'Exporter en PDF', () => { void this.exportPdf() })
      this.addAction('image-down', 'Exporter en PNG', () => { void this.exportPng() })
    }

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

  update(markdown: string, file: TFile | null): void {
    this.currentMarkdown = markdown
    this.currentFile = file
    this.render()
  }

  private marpArgs(): { inputPath: string; themeArgs: string[]; vaultBase: string } | null {
    const activeFile = this.currentFile
    if (!activeFile) return null
    const adapter = this.app.vault.adapter as any
    const vaultBase: string = adapter.basePath ?? adapter.getBasePath?.() ?? ''
    if (!vaultBase) return null
    const settings = this.getSettings()
    const themeArgs = settings.themes.flatMap(t => ['--theme-set', join(vaultBase, t.path)])
    return { inputPath: join(vaultBase, activeFile.path), themeArgs, vaultBase }
  }

  private async exportPdf(): Promise<void> {
    const ctx = this.marpArgs()
    if (!ctx) {
      new Notice('[Marpidian] Aucun fichier actif.')
      return
    }

    const activeFile = this.currentFile!
    const settings = this.getSettings()
    const outputPath = join(ctx.vaultBase, settings.exportDir, activeFile.basename + '.pdf')

    try {
      await mkdir(join(ctx.vaultBase, settings.exportDir), { recursive: true })
      await execFileAsync('marp', ['--pdf', '--allow-local-files', ...ctx.themeArgs, ctx.inputPath, '-o', outputPath])
      new Notice(`[Marpidian] PDF exporté dans ${settings.exportDir}/${activeFile.basename}.pdf`)
    } catch (e: any) {
      new Notice(`[Marpidian] Échec de l'export PDF : ${e?.stderr ?? e?.message ?? e}`)
    }
  }

  private async exportPng(): Promise<void> {
    const ctx = this.marpArgs()
    if (!ctx) {
      new Notice('[Marpidian] Aucun fichier actif.')
      return
    }

    const activeFile = this.currentFile!
    const settings = this.getSettings()
    const outputDir = join(ctx.vaultBase, settings.exportDir, activeFile.basename)
    const outputBase = join(outputDir, activeFile.basename)

    try {
      await mkdir(outputDir, { recursive: true })

      // Nettoyer les anciens fichiers numérotés (évite les résidus si le nombre de slides a changé)
      const existing = await readdir(outputDir)
      await Promise.all(
        existing
          .filter(f => /\.\d{3}\.png$/.test(f))
          .map(f => unlink(join(outputDir, f)).catch(() => {}))
      )

      await execFileAsync('marp', ['--images', 'png', '--allow-local-files', ...ctx.themeArgs, ctx.inputPath, '-o', outputBase + '.png'])

      // Renommer basename.001.png → 1.png, basename.002.png → 2.png, etc.
      const generated = (await readdir(outputDir))
        .filter(f => /\.\d{3}\.png$/.test(f))
        .sort()
      await Promise.all(
        generated.map((f, i) => rename(join(outputDir, f), join(outputDir, `${i + 1}.png`)))
      )

      new Notice(`[Marpidian] ${generated.length} slide(s) exportée(s) dans ${settings.exportDir}/${activeFile.basename}/`)
    } catch (e: any) {
      new Notice(`[Marpidian] Échec de l'export PNG : ${e?.stderr ?? e?.message ?? e}`)
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
