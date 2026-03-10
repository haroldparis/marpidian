# Export PDF + PNG — Design

## Objectif

Ajouter deux boutons d'export dans le header de la vue Marpidian :
- **PDF** : export de toute la présentation en un fichier PDF, avec save dialog
- **PNG** : export de chaque slide en image individuelle (`1.png`, `2.png`...) dans un dossier configurable

## Architecture

### Rendu pour l'export vs rendu preview

Le rendu preview injecte la couleur de fond d'Obsidian (`--background-primary`) pour l'intégration visuelle. L'export doit utiliser un HTML propre sans cette couleur — les slides gèrent leur propre fond via la CSS Marp.

### Mécanisme d'export

Electron est un Chromium complet. On crée une `BrowserWindow` cachée via `@electron/remote`, on y charge le HTML Marp depuis un fichier temporaire, puis :
- **PDF** : `webContents.printToPDF()` → buffer → `dialog.showSaveDialog()` → écriture fichier
- **PNG** : pour chaque slide, `scrollTo(0, i * 720)` + `capturePage()` → buffer → écriture fichier

### Passage des settings à la vue

`MarpPreviewView` reçoit un getter `() => MarpidianSettings` à la construction (évite la référence circulaire avec `main.ts`).

## Settings

Nouveau champ `exportDir` (défaut : `.marpidian-exports`) — chemin relatif depuis la racine du vault.

## Structure de sortie PNG

```
{vault}/{exportDir}/{nom-du-fichier-md}/1.png
{vault}/{exportDir}/{nom-du-fichier-md}/2.png
...
```

## Boutons

Ajoutés via `addAction()` dans `onOpen()` de `MarpPreviewView` :
- Icône `file-down` → Export PDF
- Icône `image-down` → Export PNG (slides)

## Contraintes

- `@electron/remote` doit être disponible (Obsidian l'expose). Fallback : Notice d'erreur claire.
- Fichier temporaire OS (`os.tmpdir()`) pour charger le HTML dans la BrowserWindow, nettoyé après export.
- Pas de navigation entre slides : hors scope (issue #4).
