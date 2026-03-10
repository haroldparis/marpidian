# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-10

### Added

- Live split-pane preview for notes with `marp: true` in frontmatter
- Auto open/close preview on file switch — closes on non-Marp files, stays open on sidebars and other non-editor panels
- Real-time preview updates with 300ms debounce
- Toggle Marp preview command (command palette)
- Custom CSS theme support — import, hot-reload on file change, delete with confirmation
- Configurable themes folder (default: `.marpidian`)
- PDF export via Marp CLI
- PNG export via Marp CLI — one file per slide, numbered sequentially (`1.png`, `2.png`, …)
- Configurable export directory (default: `.marpidian-exports`)
- Debug logging to `/tmp/marpidian.log`, toggle in Settings
- Marp CLI detection at startup — export buttons hidden when CLI is unavailable

[Unreleased]: https://github.com/haroldparis/marpidian/compare/0.1.0...HEAD
[0.1.0]: https://github.com/haroldparis/marpidian/releases/tag/0.1.0
