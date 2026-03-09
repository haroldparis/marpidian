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
