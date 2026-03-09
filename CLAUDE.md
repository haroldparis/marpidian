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
  MarpPreviewView.ts   # ItemView Obsidian : iframe srcdoc, rendu Marp
  Themes.ts            # Registre CSS : cache, factory getMarpInstance(), hot-reload
  settings.ts          # Types MarpidianSettings + mergeSettings + PluginSettingTab
  utils.ts             # detectMarpDocument(), debounce()
  __mocks__/obsidian.ts  # Mock minimal pour Vitest (obsidian n'existe pas en Node)
```

### Pattern clé : Themes.ts

`Themes` est une factory fonctionnelle — jamais d'instance Marp partagée. `getMarpInstance()` crée une nouvelle instance `Marp({ html: true })` à chaque rendu en injectant tous les CSS du cache, évitant toute pollution de state entre documents.

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

## Implémentation

Le plan d'implémentation complet (task-by-task avec code) est dans :
```
docs/plans/2026-03-09-marpidian-implementation.md
```

Si tu démarres l'implémentation, utilise le skill `superpowers:executing-plans`.

## Stack

- TypeScript · `@marp-team/marp-core` · API Obsidian
- esbuild (bundler) · Vitest (tests)
- `npm` comme package manager (pas pnpm/bun — contrainte du scaffolding Obsidian sample plugin)
- Licence MIT
