# Marpidian — design document

Date : 2026-03-09

## Contexte

Marpidian est un plugin Obsidian open-source qui intègre Marp de façon native et transparente.
L'objectif est une expérience "state-of-the-art" : écrire des slides Marp directement dans le vault,
voir la preview en temps réel dans un panneau split, avec support de thèmes custom et (v1.1)
de plugins markdown-it.

Le projet est agnostique des thèmes ARPAR/ELOQIO. Il fournit l'infrastructure ; les thèmes
sont branchés via la configuration.

Référence d'implémentation principale : marp-team/marp-vscode (open-source, mêmes problèmes résolus
pour VS Code).

---

## Scope MVP

**Inclus :**
- Détection automatique de `marp: true` dans le frontmatter
- Panneau de preview split automatique (zone principale, pas sidebar)
- Rendu en temps réel à la frappe (debounce 300ms)
- Registre de thèmes CSS (nom → chemin fichier dans le vault)
- Hot-reload des thèmes (rechargement si le fichier CSS change)
- Settings tab Obsidian pour gérer les thèmes

**Exclu du MVP :**
- Export PDF/PNG (v2)
- Plugins markdown-it (v1.1)
- Thèmes distants via URL (v1.1)
- IntelliSense / autocomplétion des directives (v2)
- Navigation slide par slide (v2 — scroll suffisant pour le MVP)

---

## Architecture

### Structure du repo

```
marpidian/
  src/
    main.ts              # Entry point, lifecycle, détection frontmatter
    MarpPreviewView.ts   # ItemView Obsidian, iframe, injection HTML
    Themes.ts            # Registre thèmes, hot-reload, instance Marp
    settings.ts          # PluginSettingTab, persistance settings
    utils.ts             # detectMarpDocument, debounce, helpers
  docs/                  # gitignore — documents internes
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.js
  .gitignore
```

### Composants

**`main.ts`**
Point d'entrée du plugin. Enregistre la vue, écoute `workspace.on('active-leaf-change')`
pour détecter l'ouverture d'un fichier Marp. Enregistre une commande palette
"Toggle Marp Preview". Gère le cycle de vie (onload / onunload).

**`Themes.ts`**
Traduit directement le pattern `themes.ts` de marp-vscode.
- `observedThemes : Map<string, Theme>` — cache des CSS chargés
- `getMarpInstanceFor(file)` — crée une nouvelle instance `Marp()`, ajoute tous
  les thèmes enregistrés via `marp.themeSet.add(css)`, retourne l'instance
- Hot-reload via `vault.on('modify', themeFile => reload)` — rechargement sans
  redémarrer Obsidian

Pattern clé : jamais d'instance Marp partagée entre documents. Nouvelle instance
à chaque rendu pour éviter toute pollution de state.

**`MarpPreviewView.ts`**
Extends `ItemView`. Ouverture via `workspace.getLeaf('split', 'vertical')` pour
un split dans la zone principale (pas la sidebar).

Rendu : le HTML + CSS produits par Marp Core sont injectés dans un `<iframe srcdoc>`.
L'iframe isole les styles Marp (reset CSS, dimensions fixes) du reste de l'UI Obsidian.

```typescript
const { html, css } = marp.render(markdown)
iframe.srcdoc = `<style>${css}</style>${html}`
```

Mise à jour : debounce 300ms sur les changements éditeur pour éviter les rendus inutiles.

**`settings.ts`**
`PluginSettingTab` standard Obsidian. Une section "Themes" : liste de paires
nom → chemin relatif dans le vault (ex: `eloqio-slide → themes/eloqio-slide.css`).
Persistance via `this.saveData()` / `this.loadData()`.

---

## Flux principal

```
Fichier .md ouvert
  └─ frontmatter contient marp: true ?
       ├─ non → rien
       └─ oui → MarpPreviewView.open() [split vertical]
                  └─ éditeur change (debounce 300ms)
                       └─ Themes.getMarpInstanceFor(file)
                            └─ marp.render(markdown)
                                 └─ iframe.srcdoc = html + css
```

---

## Workflow de développement

- `npm run dev` → esbuild en mode watch, output dans `brain/.obsidian/plugins/marpidian/`
- Plugin communautaire **Hot Reload** installé dans le vault → rechargement automatique
  à chaque build
- Pas de symlink nécessaire — esbuild écrit directement dans le vault

---

## Licence

**MIT License** — alignée sur l'ensemble de l'écosystème Marp (marp-core, marpit, marp-vscode).
Compatible avec le registre des plugins communautaires Obsidian. Aucune contrainte pour
les contributeurs ou les utilisateurs.

---

## Références

- [marp-team/marp-vscode](https://github.com/marp-team/marp-vscode) — référence principale
- [marp-team/marp-core](https://github.com/marp-team/marp-core) — moteur de rendu
- [obsidian.md/plugins](https://docs.obsidian.md/plugins) — API Obsidian
- [obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) — scaffolding de départ
