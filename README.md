# Marpidian

**Native [Marp](https://marp.app) integration for [Obsidian](https://obsidian.md).** Write Marp presentations in your vault, preview them live, and export to PDF or PNG — without leaving your editor.

> Desktop only · Requires Obsidian 1.4.0+

---

## What it does

Add `marp: true` to any note's frontmatter. Marpidian automatically opens a live preview panel beside your editor and keeps it in sync as you type.

```yaml
---
marp: true
theme: default
paginate: true
---

# My Presentation

Content here.

---

# Slide 2

More content.
```

That's it. No configuration required to get started.

---

## Features

- **Live preview** — split-pane preview updates as you type (300ms debounce)
- **Auto open/close** — preview opens when you switch to a Marp note, closes when you leave
- **Custom themes** — import your own CSS themes, with hot-reload on file change
- **PDF export** — one-click export via Marp CLI
- **PNG export** — export each slide as a numbered PNG (1.png, 2.png, …)
- **Theme manager** — install, preview, and delete themes from Settings

---

## Requirements

- **Obsidian** 1.4.0 or later (desktop only)
- **Marp CLI** — optional, required for PDF/PNG export

### Installing Marp CLI

Marpidian detects Marp CLI automatically if it's in your system PATH. The plugin works without it — you just won't have export buttons.

Install options:

```bash
# npm (global)
npm install -g @marp-team/marp-cli

# Homebrew (macOS/Linux)
brew install marp-cli
```

See the [official Marp CLI site](https://github.com/marp-team/marp-cli) for all options.

---

## Installation

### Community plugins (recommended)

1. Open **Settings → Community plugins**
2. Search for **Marpidian**
3. Click **Install**, then **Enable**

### BRAT (beta)

Install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then add:

```
https://github.com/haroldparis/marpidian
```

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/haroldparis/marpidian/releases/latest)
2. Copy them to `<vault>/.obsidian/plugins/marpidian/`
3. Enable the plugin in **Settings → Community plugins**

---

## Usage

### Live preview

Open any Markdown note with `marp: true` in its frontmatter. The preview panel opens automatically on the right. Navigate away and it closes.

To toggle the preview manually: **Command palette → Toggle Marp preview**

### Exporting

When Marp CLI is installed, two buttons appear in the preview panel header:

| Button | Output |
|--------|--------|
| PDF | `<exportDir>/<filename>/<filename>.pdf` |
| PNG | `<exportDir>/<filename>/1.png`, `2.png`, … |

The export directory defaults to `.marpidian-exports` at the vault root. You can change it in Settings.

### Custom themes

1. Open **Settings → Marpidian → Import a theme**
2. Select a `.css` file — it must contain a `/* @theme your-theme-name */` directive
3. Use it in your notes with `theme: your-theme-name` in the frontmatter

Themes are stored in `.marpidian/` (configurable) and hot-reload on file change: edit your CSS and the preview updates instantly.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Themes folder | `.marpidian` | Where imported theme CSS files are stored |
| Export directory | `.marpidian-exports` | Root directory for PDF and PNG exports |
| Debug logging | Off | Writes export events to `/tmp/marpidian.log` |

---

## Contributing

Contributions are welcome. Please open an issue before submitting a PR for anything beyond a bug fix.

### Building from source

```bash
git clone https://github.com/haroldparis/marpidian
cd marpidian
npm install
npm run dev   # watch mode — builds to VAULT_PLUGIN_PATH
```

Set `VAULT_PLUGIN_PATH` to your plugin directory, or edit `esbuild.config.js` directly.

```bash
npm test      # unit tests (Vitest)
npm run build # production build
```

### Project structure

```
src/
  main.ts            # Plugin lifecycle, file detection, orchestration
  MarpPreviewView.ts # Live preview panel, PDF/PNG export
  Themes.ts          # CSS theme registry with caching and hot-reload
  settings.ts        # Settings types
  SettingTab.ts      # Settings UI
  utils.ts           # Pure helpers
```

---

## License

[ISC](LICENSE) · Built with [Marp Core](https://github.com/marp-team/marp-core)
