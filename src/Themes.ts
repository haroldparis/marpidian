import Marp from '@marp-team/marp-core'

export class Themes {
  private cssCache = new Map<string, string>()
  private cleanups = new Map<string, () => void>()
  private onUpdate: (() => void) | null = null
  private cachedMarp: Marp | null = null

  constructor(
    private readFile: (path: string) => Promise<string>,
    private onFileChange: (path: string, cb: () => void) => () => void
  ) {}

  setOnUpdate(cb: () => void): void {
    this.onUpdate = cb
  }

  async loadTheme(path: string): Promise<void> {
    const css = await this.readFile(path)
    this.cssCache.set(path, css)
    this.cachedMarp = null

    const cleanup = this.onFileChange(path, async () => {
      const updated = await this.readFile(path)
      this.cssCache.set(path, updated)
      this.cachedMarp = null
      this.onUpdate?.()
    })
    this.cleanups.set(path, cleanup)
  }

  getMarpInstance(): Marp {
    if (this.cachedMarp) return this.cachedMarp

    const marp = new Marp({ html: true })
    for (const css of this.cssCache.values()) {
      try {
        marp.themeSet.add(css)
      } catch {
        console.warn('[Marpidian] invalid CSS theme ignored')
      }
    }
    this.cachedMarp = marp
    return marp
  }

  dispose(): void {
    this.cleanups.forEach((cleanup) => {
      cleanup()
    })
    this.cleanups.clear()
    this.cssCache.clear()
    this.cachedMarp = null
  }
}
