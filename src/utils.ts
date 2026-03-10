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
 * Vérifie si un href pointe hors du vault.
 * Utilisée par hasOutOfVaultImageRef pour éviter la duplication de la logique
 * entre la syntaxe Markdown et les balises HTML.
 */
function isOutOfVaultHref(href: string, vaultBase: string, fileDir: string): boolean {
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('data:')) return false
  if (href.startsWith('/') || href.startsWith('file://') || href.startsWith('~')) return true
  const resolved = resolveRelative(fileDir, href)
  return !resolved.startsWith(vaultBase + '/') && resolved !== vaultBase
}

/**
 * Détecte les références de ressources locales pointant hors du vault.
 * Protège contre la divulgation de fichiers locaux via --allow-local-files.
 *
 * Couvre sept syntaxes (Marp html:true honore le HTML embarqué dans les slides) :
 * - Markdown : ![alt](url)
 * - HTML : <img src="...">
 * - HTML : <object data="..."> — Chrome rend le contenu texte brut inline dans le PDF
 * - HTML : <embed src="..."> — même comportement que <object>
 * - HTML : <video src>, <audio src>, <source src> — accès fichier lors du rendu Chromium
 *
 * Vecteur d'attaque : une note Marp partagée contenant <object data="/etc/shadow">
 * ou <img src="../../.ssh/id_rsa"> serait exportée via --allow-local-files,
 * incorporant le contenu du fichier local dans le PDF sans que l'utilisateur le sache.
 */
export function hasOutOfVaultImageRef(
  markdown: string,
  vaultBase: string,
  fileDir: string
): boolean {
  // Syntaxe Markdown : ![alt](url)
  for (const m of markdown.matchAll(/!\[.*?\]\(([^)\s]+)/g)) {
    if (isOutOfVaultHref(m[1], vaultBase, fileDir)) return true
  }

  // <img src="..."> — échoue pour les fichiers non-image, mais tente quand même l'accès.
  for (const m of markdown.matchAll(/<img\b[^>]*?\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3]
    if (href && isOutOfVaultHref(href, vaultBase, fileDir)) return true
  }

  // <object data="..."> — Chrome rend les fichiers texte en clair inline dans le PDF.
  for (const m of markdown.matchAll(/<object\b[^>]*?\bdata=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3]
    if (href && isOutOfVaultHref(href, vaultBase, fileDir)) return true
  }

  // <embed src="..."> — même comportement que <object data> pour les fichiers locaux.
  for (const m of markdown.matchAll(/<embed\b[^>]*?\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3]
    if (href && isOutOfVaultHref(href, vaultBase, fileDir)) return true
  }

  // <video src>, <audio src>, <source src> — Chromium accède aux fichiers locaux
  // lors du rendu PDF même si le contenu media n'est pas directement intégré.
  for (const m of markdown.matchAll(/<(?:video|audio|source)\b[^>]*?\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = m[1] ?? m[2] ?? m[3]
    if (href && isOutOfVaultHref(href, vaultBase, fileDir)) return true
  }

  return false
}
