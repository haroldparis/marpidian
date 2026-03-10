import { TFile, type App } from 'obsidian'

export class FileExplorerDecorator {
  private cleanups: (() => void)[] = []

  constructor(private app: App) {}

  /**
   * Passe initiale sur tous les fichiers .md + enregistre les listeners
   * pour maintenir les badges à jour. À appeler une seule fois (onLayoutReady).
   */
  decorate(): void {
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.decorateFile(file)
    }

    const metaRef = this.app.metadataCache.on('changed', (file) => {
      if (file.extension === 'md') this.decorateFile(file)
    })
    this.cleanups.push(() => this.app.metadataCache.offref(metaRef))

    const renameRef = this.app.vault.on('rename', (file) => {
      if (file instanceof TFile && file.extension === 'md') this.decorateFile(file)
    })
    this.cleanups.push(() => this.app.vault.offref(renameRef))

    this.watchExplorer()
  }

  /**
   * Retire tous les badges injectés et stoppe les listeners/observers.
   * À appeler dans onunload.
   */
  dispose(): void {
    // Si le container n'existe plus, ses badges sont déjà détruits avec lui
    this.getExplorerContainer()
      ?.querySelectorAll('.nav-file-tag[data-marpidian]')
      .forEach((el) => el.remove())
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups = []
  }

  private decorateFile(file: TFile): void {
    const item = this.getFileItem(file)
    if (!item) return

    const existing = item.querySelector('.nav-file-tag[data-marpidian]')
    const isMarp = this.isMarpFile(file)

    if (isMarp && !existing) {
      const tag = item.createEl('span', { cls: 'nav-file-tag', text: 'marp' })
      tag.setAttribute('data-marpidian', 'true')
    } else if (!isMarp && existing) {
      existing.remove()
    }
  }

  private isMarpFile(file: TFile): boolean {
    return Boolean(this.app.metadataCache.getFileCache(file)?.frontmatter?.marp)
  }

  private getExplorerContainer(): HTMLElement | null {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0]
    return leaf?.view?.containerEl ?? null
  }

  private getFileItem(file: TFile): HTMLElement | null {
    const container = this.getExplorerContainer()
    if (!container) return null
    // Escape " et \ pour l'utilisation dans un sélecteur CSS attribute string
    const path = file.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return container.querySelector(`.nav-file-title[data-path="${path}"]`)
  }

  /**
   * MutationObserver sur le conteneur file-explorer.
   * Décore les nouveaux items DOM ajoutés (expansion de dossiers repliés).
   */
  private watchExplorer(): void {
    const container = this.getExplorerContainer()
    if (!container) return

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue
          const titleEls = node.classList.contains('nav-file-title')
            ? [node]
            : Array.from(node.querySelectorAll<HTMLElement>('.nav-file-title'))
          for (const titleEl of titleEls) {
            const path = titleEl.getAttribute('data-path')
            if (!path?.endsWith('.md')) continue
            const file = this.app.vault.getAbstractFileByPath(path)
            if (file instanceof TFile) this.decorateFile(file)
          }
        }
      }
    })

    observer.observe(container, { childList: true, subtree: true })
    this.cleanups.push(() => observer.disconnect())
  }
}
