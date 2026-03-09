import { ItemView, WorkspaceLeaf } from 'obsidian'
import type { Themes } from './Themes'
import { debounce } from './utils'

export const VIEW_TYPE_MARP = 'marpidian-preview'

export class MarpPreviewView extends ItemView {
  private themes: Themes
  private iframe: HTMLIFrameElement | null = null
  private currentMarkdown = ''

  private scheduleRender = debounce(() => this.render(), 300)

  constructor(leaf: WorkspaceLeaf, themes: Themes) {
    super(leaf)
    this.themes = themes
  }

  getViewType(): string {
    return VIEW_TYPE_MARP
  }

  getDisplayText(): string {
    return 'Marp Preview'
  }

  getIcon(): string {
    return 'presentation'
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty()
    this.contentEl.style.cssText = 'padding: 0; overflow: hidden; height: 100%;'

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
    this.scheduleRender()
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
    body { background: #888; overflow-y: auto; }
    ${css}
  </style>
</head>
<body>
  ${html}
</body>
</html>`
  }
}
