/**
 * Detects whether a Markdown string is a Marp document.
 * A Marp document has `marp: true` in its YAML frontmatter.
 */
export function detectMarpDocument(markdown: string): boolean {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return false
  return /^marp:\s*true\s*$/m.test(match[1])
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
