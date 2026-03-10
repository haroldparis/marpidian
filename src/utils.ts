/**
 * Detects whether a Markdown string is a Marp document.
 * A Marp document has `marp: true` in its YAML frontmatter.
 */
export function detectMarpDocument(markdown: string): boolean {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return false
  return /^marp:\s*"?true"?\s*$/m.test(match[1])
}

/**
 * Returns a debounced version of fn that delays invocation by `delay` ms.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Extracts the theme name from a Marp CSS file.
 * Returns null if no @theme directive is found.
 */
export function extractThemeName(css: string): string | null {
  const match = css.match(/\/\*\s*@theme\s+(\S+)/)
  return match ? match[1] : null
}

/**
 * Returns the absolute base path of the vault on disk.
 * FileSystemAdapter (desktop) exposes basePath but it is not typed in the public Obsidian API.
 * Returns an empty string if unavailable (e.g. mobile).
 */
export function getVaultBasePath(adapter: unknown): string {
  const a = adapter as { basePath?: string; getBasePath?: () => string }
  return a.basePath ?? a.getBasePath?.() ?? ''
}

/**
 * Résout un chemin relatif href depuis fileDir (implémentation portable sans node:path).
 */
function resolveRelative(fileDir: string, href: string): string {
  const segments = (fileDir + '/' + href).split('/').reduce<string[]>((acc, seg) => {
    if (seg === '..') acc.pop()
    else if (seg !== '' && seg !== '.') acc.push(seg)
    return acc
  }, [])
  return '/' + segments.join('/')
}

/**
 * Détecte les références d'images Markdown pointant hors du vault.
 * Protège contre la divulgation de fichiers locaux via --allow-local-files.
 * Note : les balises <img> HTML (avec Marp html:true) ne sont pas couvertes.
 */
export function hasOutOfVaultImageRef(
  markdown: string,
  vaultBase: string,
  fileDir: string
): boolean {
  const imgRegex = /!\[.*?\]\(([^)\s]+)/g
  let match: RegExpExecArray | null
  while ((match = imgRegex.exec(markdown)) !== null) {
    const href = match[1]
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('data:')) continue
    if (href.startsWith('/') || href.startsWith('file://') || href.startsWith('~')) return true
    const resolved = resolveRelative(fileDir, href)
    if (!resolved.startsWith(vaultBase + '/') && resolved !== vaultBase) return true
  }
  return false
}
