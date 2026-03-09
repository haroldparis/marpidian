import Marp from '@marp-team/marp-core'

export class Themes {
  private cssCache = new Map<string, string>()
  private cleanups = new Map<string, () => void>()

  constructor(
    private readFile: (path: string) => Promise<string>,
    private onFileChange: (path: string, cb: () => void) => () => void
  ) {}

  async loadTheme(name: string, path: string): Promise<void> {
    const css = await this.readFile(path)
    this.cssCache.set(path, css)

    const cleanup = this.onFileChange(path, async () => {
      const updated = await this.readFile(path)
      this.cssCache.set(path, updated)
    })
    this.cleanups.set(path, cleanup)
  }

  getMarpInstance(): Marp {
    const marp = new Marp({ html: true })
    for (const css of this.cssCache.values()) {
      try {
        marp.themeSet.add(css)
      } catch {
        // CSS invalide — ignoré silencieusement
      }
    }
    return marp
  }

  dispose(): void {
    this.cleanups.forEach(cleanup => cleanup())
    this.cleanups.clear()
    this.cssCache.clear()
  }
}
