import { spawn } from 'node:child_process'
import { appendFile, mkdir, readdir, rename, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ItemView, Notice, type TFile, type WorkspaceLeaf } from 'obsidian'
import type { MarpidianSettings } from './settings'
import type { Themes } from './Themes'
import { getVaultBasePath } from './utils'

const LOG_FILE = join(tmpdir(), 'marpidian.log')

function log(enabled: boolean, msg: string): void {
  if (!enabled) return
  const line = `[${new Date().toISOString()}] ${msg}\n`
  appendFile(LOG_FILE, line).catch(() => {})
}

/**
 * Exécute marp CLI avec stdin ignoré (évite le blocage sur stdin pipe).
 * Rejette avec le contenu stderr si marp sort avec un code non nul.
 */
function runMarp(args: string[], debug: boolean): Promise<void> {
  log(debug, `runMarp: marp ${args.join(' ')}`)
  return new Promise((resolve, reject) => {
    const child = spawn('marp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stderr: string[] = []
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))
    const timer = setTimeout(() => {
      child.kill()
      reject(
        new Error("Timeout : marp CLI n'a pas répondu dans les 60 secondes.")
      )
    }, 60_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const errText = stderr.join('').trim()
      if (errText) log(debug, `runMarp stderr: ${errText}`)
      if (code === 0) {
        log(debug, 'runMarp: succès')
        resolve()
      } else reject(new Error(errText || `marp a retourné le code ${code}`))
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      log(debug, `runMarp error: ${err.message}`)
      reject(err)
    })
  })
}

export const VIEW_TYPE_MARP = 'marpidian-preview'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''
  private currentFile: TFile | null = null
  private getSettings: () => MarpidianSettings
  private marpCliAvailable: boolean
  private exporting = false

  constructor(
    leaf: WorkspaceLeaf,
    themes: Themes,
    getSettings: () => MarpidianSettings,
    marpCliAvailable: boolean
  ) {
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
      this.addAction('file-down', 'Exporter en PDF', () => {
        void this.exportPdf()
      })
      this.addAction('image-down', 'Exporter en PNG', () => {
        void this.exportPng()
      })
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

  private marpArgs(): {
    inputPath: string
    themeArgs: string[]
    vaultBase: string
    activeFile: TFile
  } | null {
    const activeFile = this.currentFile
    if (!activeFile) return null
    const vaultBase = getVaultBasePath(this.app.vault.adapter)
    if (!vaultBase) return null
    const settings = this.getSettings()
    const themeArgs = settings.themes.flatMap((t) => [
      '--theme-set',
      join(vaultBase, t.path),
    ])
    // inputPath doit précéder --theme-set : marp traite --theme-set comme un tableau
    // et consomme tous les arguments positionnels qui suivent.
    return {
      inputPath: join(vaultBase, activeFile.path),
      themeArgs,
      vaultBase,
      activeFile,
    }
  }

  private async runExport(
    label: string,
    marpArgsBuilder: (
      ctx: { inputPath: string; themeArgs: string[]; vaultBase: string },
      outputDir: string,
      activeFile: TFile
    ) => Promise<string>
  ): Promise<void> {
    const settings = this.getSettings()
    log(
      settings.debugLog,
      `${label}: exporting=${this.exporting} currentFile=${this.currentFile?.path ?? 'null'}`
    )

    if (this.exporting) {
      new Notice('[Marpidian] Export déjà en cours.')
      return
    }
    const ctx = this.marpArgs()
    if (!ctx) {
      log(settings.debugLog, `${label}: marpArgs() null`)
      new Notice(
        `[Marpidian] Aucun fichier actif. (currentFile=${this.currentFile?.path ?? 'null'})`
      )
      return
    }

    const { activeFile } = ctx
    const outputDir = join(
      ctx.vaultBase,
      settings.exportDir,
      activeFile.basename
    )

    this.exporting = true
    new Notice(`[Marpidian] Export ${label} en cours...`)
    try {
      await mkdir(outputDir, { recursive: true })
      const notice = await marpArgsBuilder(ctx, outputDir, activeFile)
      log(settings.debugLog, `${label}: terminé avec succès`)
      new Notice(notice)
    } catch (e: any) {
      log(settings.debugLog, `${label}: erreur — ${e?.message ?? e}`)
      new Notice(`[Marpidian] Échec de l'export ${label} : ${e?.message ?? e}`)
    } finally {
      this.exporting = false
    }
  }

  private async exportPdf(): Promise<void> {
    await this.runExport('PDF', async (ctx, outputDir, activeFile) => {
      const outputPath = join(outputDir, `${activeFile.basename}.pdf`)
      const settings = this.getSettings()
      log(settings.debugLog, `exportPdf: outputPath=${outputPath}`)
      await runMarp(
        [
          '--pdf',
          '--allow-local-files',
          ctx.inputPath,
          ...ctx.themeArgs,
          '-o',
          outputPath,
        ],
        settings.debugLog
      )
      return `[Marpidian] PDF exporté dans ${settings.exportDir}/${activeFile.basename}/${activeFile.basename}.pdf`
    })
  }

  private async exportPng(): Promise<void> {
    await this.runExport('PNG', async (ctx, outputDir, activeFile) => {
      const outputBase = join(outputDir, activeFile.basename)
      const settings = this.getSettings()

      // Nettoyer les anciens fichiers numérotés (évite les résidus si le nombre de slides a changé)
      const existing = await readdir(outputDir)
      await Promise.all(
        existing
          .filter((f) => /\.\d{3}\.png$/.test(f))
          .map((f) => unlink(join(outputDir, f)).catch(() => {}))
      )

      await runMarp(
        [
          '--images',
          'png',
          '--allow-local-files',
          ctx.inputPath,
          ...ctx.themeArgs,
          '-o',
          `${outputBase}.png`,
        ],
        settings.debugLog
      )

      // Renommer basename.001.png → 1.png, basename.002.png → 2.png, etc.
      const generated = (await readdir(outputDir))
        .filter((f) => /\.\d{3}\.png$/.test(f))
        .sort()
      await Promise.all(
        generated.map((f, i) =>
          rename(join(outputDir, f), join(outputDir, `${i + 1}.png`))
        )
      )

      log(
        settings.debugLog,
        `exportPng: terminé — ${generated.length} slide(s)`
      )
      return `[Marpidian] ${generated.length} slide(s) exportée(s) dans ${settings.exportDir}/${activeFile.basename}/`
    })
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
