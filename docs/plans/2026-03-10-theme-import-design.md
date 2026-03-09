# Marpidian — theme import design

Date : 2026-03-10

## Contexte

Le registre de thèmes MVP exige que l'utilisateur copie manuellement son fichier CSS dans le vault puis saisisse le chemin à la main. Cette friction est inutile.

## Scope

**Inclus :**
- Import via file picker natif (`<input type="file">` — Electron renderer)
- Copie automatique dans `.marpidian/` (configurable)
- Détection du nom depuis `/* @theme name */`
- Fail fast sur conflit (nom ou fichier déjà présent) via `Notice`
- Bouton crayon par thème : ouvre dans l'éditeur par défaut (`shell.openPath`)
- Bouton révéler (global) : ouvre le dossier dans Finder/Nautilus (`shell.showItemInFolder`)
- Suppression : retire des settings + supprime le fichier du vault
- Suppression du champ `name` inutile dans `ThemeEntry`

**Exclu :**
- Confirmation avant suppression (l'utilisateur est grand)
- Import par URL distante (v1.1)
- Dossier par thème (toujours un seul fichier CSS)

## Refactoring du modèle de données

`ThemeEntry` perd son champ `name` (valeur utilisateur sans utilité — le vrai nom vient du CSS) :

```typescript
// Avant
interface ThemeEntry { name: string; path: string }

// Après
interface ThemeEntry { path: string }
```

`MarpidianSettings` gagne `themesFolder` :

```typescript
interface MarpidianSettings {
  themes: ThemeEntry[]
  themesFolder: string  // défaut : '.marpidian'
}
```

## Nouveau composant : extractThemeName

```typescript
// src/utils.ts
export function extractThemeName(css: string): string | null {
  const match = css.match(/\/\*\s*@theme\s+(\S+)\s*\*\//)
  return match ? match[1] : null
}
```

Logé dans `utils.ts` (même famille que `detectMarpDocument`). TDD.

## Import flow

```
[Importer un thème]
  └─ <input type="file" accept=".css">.click()
       └─ file sélectionné
            ├─ Lecture CSS (FileReader API — renderer)
            ├─ extractThemeName(css) → null ? Notice "CSS sans @theme" → stop
            ├─ Conflit nom ? Notice "Thème 'X' déjà présent" → stop
            ├─ Conflit fichier ? Notice "Fichier déjà importé" → stop
            ├─ vault.adapter.mkdir(themesFolder)
            ├─ vault.adapter.write(dest, css)
            └─ settings.themes.push({ path }) + saveSettings(true)
```

Note : `FileReader` (Web API standard, disponible dans Electron renderer) — pas besoin de `require('fs')` ni d'accès Node direct.

## UI settings tab

```
Thèmes
──────────────────────────────────────────
Dossier    [.marpidian          ]  [📁]
──────────────────────────────────────────
einstein                        [✏️] [🗑️]
my-theme                        [✏️] [🗑️]
──────────────────────────────────────────
                    [↑ Importer un thème]
```

- Icônes via `setIcon()` Obsidian : `pencil`, `trash`, `folder-open`, `upload`
- Nom affiché : `extractThemeName(css)` ou filename en fallback
- Zéro CSS custom — composants `Setting` natifs uniquement

## Electron APIs

- File picker : `<input type="file">` — API Web standard, disponible dans Electron renderer
- Lire le fichier sélectionné : `FileReader.readAsText(file)`
- Ouvrir dans l'éditeur : `shell.openPath(absolutePath)` — import depuis `electron` (external esbuild)
- Révéler dans Finder/Nautilus : `shell.showItemInFolder(absolutePath)` — idem
- `shell` est disponible directement dans le renderer process, pas besoin de `remote`

## Suppresson

1. Retirer l'entrée de `settings.themes`
2. `vault.adapter.remove(entry.path)`
3. `saveSettings(true)` → refresh preview

## Références

- electron.shell docs : https://www.electronjs.org/docs/latest/api/shell
- Obsidian FileSystemAdapter : `app.vault.adapter` (FileSystemAdapter sur desktop)
