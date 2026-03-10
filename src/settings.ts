export interface ThemeEntry {
  path: string
}

export interface MarpidianSettings {
  themes: ThemeEntry[]
  themesFolder: string
  exportDir: string
  debugLog: boolean
}

export const DEFAULT_SETTINGS: MarpidianSettings = {
  themes: [],
  themesFolder: '.marpidian',
  exportDir: '.marpidian-exports',
  debugLog: false,
}

export function mergeSettings(
  saved: Partial<MarpidianSettings>
): MarpidianSettings {
  return {
    themes: Array.isArray(saved.themes)
      ? saved.themes
      : DEFAULT_SETTINGS.themes,
    themesFolder:
      typeof saved.themesFolder === 'string'
        ? saved.themesFolder
        : DEFAULT_SETTINGS.themesFolder,
    exportDir:
      typeof saved.exportDir === 'string'
        ? saved.exportDir
        : DEFAULT_SETTINGS.exportDir,
    debugLog:
      typeof saved.debugLog === 'boolean'
        ? saved.debugLog
        : DEFAULT_SETTINGS.debugLog,
  }
}
