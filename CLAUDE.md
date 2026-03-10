# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexte

**Marpidian** est un plugin Obsidian open-source qui intègre [Marp](https://marp.app) de façon native. Il détecte `marp: true` dans le frontmatter, ouvre un panneau split avec la preview en temps réel (debounce 300ms), et supporte un registre de thèmes CSS custom avec hot-reload.

Référence d'implémentation : [marp-team/marp-vscode](https://github.com/marp-team/marp-vscode).

## Commandes de développement

```bash
# Installer les dépendances
npm install

# Mode dev (watch → build vers le vault Obsidian)
npm run dev

# Build production
npm run build

# Tests unitaires
npm test

# Tests en mode watch
npm run test:watch
```

Le build écrit directement dans le vault Obsidian via esbuild :
`/home/harold/Workspace/brain/.obsidian/plugins/marpidian/main.js`

Variable d'environnement `VAULT_PLUGIN_PATH` pour surcharger la destination.

## Architecture

```
src/
  main.ts              # Entry point : lifecycle, détection fichier, orchestration
  MarpPreviewView.ts   # ItemView Obsidian : iframe srcdoc, rendu Marp, exports CLI
  Themes.ts            # Registre CSS : cache Marp instance, hot-reload, setOnUpdate()
  settings.ts          # Types MarpidianSettings + mergeSettings (types purs uniquement)
  SettingTab.ts        # PluginSettingTab + ConfirmDeleteModal (UI settings)
  utils.ts             # detectMarpDocument(), debounce(), getVaultBasePath()
  __mocks__/obsidian.ts  # Mock minimal pour Vitest (obsidian n'existe pas en Node)
```

### Pattern clé : Themes.ts

`Themes` maintient une instance Marp cachée (`cachedMarp`), invalidée à chaque `loadTheme()` ou hot-reload CSS. `getMarpInstance()` reconstruit uniquement si le cache est nul. `setOnUpdate(cb)` permet à `main.ts` de déclencher un re-render quand un thème change.

### Rendu via iframe

Le HTML + CSS produits par `marp.render(markdown)` sont injectés dans `<iframe srcdoc>` pour isoler les styles Marp du reste de l'UI Obsidian.

### Flux principal

```
Fichier .md ouvert
  └─ marp: true dans frontmatter ?
       └─ oui → MarpPreviewView.open() [getLeaf('split', 'vertical')]
                  └─ editor-change (debounce 300ms)
                       └─ Themes.getMarpInstance()
                            └─ marp.render(markdown)
                                 └─ iframe.srcdoc = html + css
```

## Tests

Vitest avec un mock `obsidian` déclaré via alias dans `vitest.config.ts`.

Modules testés unitairement : `utils.ts`, `settings.ts`, `Themes.ts`.

`MarpPreviewView.ts` et `main.ts` sont validés manuellement via hot-reload Obsidian (plugin communautaire **Hot Reload** de pjeby).

Pour lancer un test spécifique :
```bash
npm test -- utils
npm test -- Themes
```

## Export (Marp CLI)

Les exports PDF et PNG nécessitent `marp` dans le PATH système. Détecté au chargement via `spawnSync('marp', ['--version'])`.

Debug logging dans `/tmp/marpidian.log`, activable via Settings > Debug logging.

Dossier d'export : `<vault>/<exportDir>/<basename>/` (PDF et PNG colocalisés).

## Gotchas critiques

**Marp CLI — `--theme-set` est un tableau yargs** : il consomme tous les arguments positionnels qui suivent. Toujours passer `inputPath` AVANT `--theme-set` :
```
['--pdf', '--allow-local-files', inputPath, '--theme-set', 'theme.css', '-o', out]
```

**Marp CLI — stdin** : utiliser `spawn` avec `stdio: ['ignore', 'pipe', 'pipe']`. `execFile` ne supporte pas `stdio` custom et bloque sur stdin. Ne pas passer `--no-stdin` (invalide dans la version courante).

**Race condition `activeView.file`** : capturer `const file = activeView.file` AVANT tout `await` dans `onActiveLeafChange`. L'`await openPreview()` change le focus et rend `getActiveViewOfType(MarkdownView)` null ensuite.

**`require('electron')` inline** : l'import top-level `import ... from 'electron'` casse Vitest. Utiliser `require('electron')` directement dans les callbacks.

**`registerEvent` dans `onLayoutReady`** : les events workspace (`active-leaf-change`, `editor-change`) doivent être enregistrés dans `this.app.workspace.onLayoutReady(...)` pour éviter les triggers parasites pendant le boot d'Obsidian.

## Stack

- TypeScript · `@marp-team/marp-core` · API Obsidian
- esbuild (bundler) · Vitest (tests)
- `npm` comme package manager (pas pnpm/bun — contrainte du scaffolding Obsidian sample plugin)
- Licence MIT
