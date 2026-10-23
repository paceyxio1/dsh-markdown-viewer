/**
 * Single-tilde restoration.
 *
 * DSH's parser keeps micromark's `singleTilde` default, so `~text~` renders as
 * `<del>` although GFM reserves strikethrough for `~~text~~` — and range
 * tildes (`第 105~112 行`) pair up the same way, striking whole spans by
 * accident.
 *
 * A rendered `<del>` element carries no marker information, so this module
 * locates each `<del>`'s span IN THE SOURCE instead of re-simulating the
 * parser: the del's rendered text is matched against the source (skipping
 * inline markup characters that rendering consumed), and the tilde runs
 * immediately around the matched span decide — one tilde on both sides means
 * a single-tilde strike to restore, two on both sides means a legitimate
 * `~~` strike to keep, anything else is left alone.
 *
 * `sources` are the Markdown source texts behind the rendered container, in
 * render order (for the chat that is one source per text block, because each
 * block is parsed by its own MarkdownText instance; for a document preview it
 * is the file as a whole).
 */

/** Markup characters that rendering consumes, so the source may hold extras. */
const MARKUP_SKIP = new Set(['*', '`', '\\'])

/** The rendered text of a strike never contains a literal tilde. */
const MARKER = /~/

/** How far past a failed start to keep looking for the next occurrence. */
const RETRY_LIMIT = 24

/** Count the consecutive tildes ending just before `at`. */
function tildeRunEndingAt(source: string, at: number): number {
  let count = 0
  while (at - 1 - count >= 0 && source[at - 1 - count] === '~') count += 1
  return count
}

/** Count the consecutive tildes starting exactly at `at`. */
function tildeRunStartingAt(source: string, at: number): number {
  let count = 0
  while (at + count < source.length && source[at + count] === '~') count += 1
  return count
}

/** Whether `source[at]` matches `char`, tolerating boundary exhaustion. */
function charMatches(source: string, at: number, char: string): boolean {
  return at < source.length && source[at] === char
}

/**
 * Locate one `<del>`'s source span.
 * @returns `[start, end)`, or undefined when the content cannot be located
 * verbatim (up to skipped markup characters) — the del is then left struck.
 */
export function matchSourceSpan(source: string, cursor: number, content: string): [number, number] | undefined {
  if (content === '') return undefined
  let searched = cursor
  let retries = 0
  while (retries <= RETRY_LIMIT) {
    const first = source.indexOf(content.charAt(0), searched)
    if (first === -1) return undefined
    let si = first
    let ci = 0
    while (si < source.length && ci < content.length) {
      if (source[si] === content[ci]) {
        si += 1
        ci += 1
        continue
      }
      if (si + content.length - ci > source.length) break
      if (MARKUP_SKIP.has(source[si])) {
        si += 1
        continue
      }
      break
    }
    if (ci === content.length) return [first, si]
    searched = first + 1
    retries += 1
  }
  return undefined
}

/**
 * Decide what to do with one `<del>` whose source span is known.
 * @returns `'restore'` for a single-tilde strike, `'keep'` for a `~~` strike,
 * `'skip'` when the surrounding tildes are not a coherent pair.
 */
export function resolveDelMarker(source: string, start: number, end: number): 'restore' | 'keep' | 'skip' {
  const runBefore = tildeRunEndingAt(source, start)
  const runAfter = tildeRunStartingAt(source, end)
  if (runBefore === 1 && runAfter === 1) return 'restore'
  if (runBefore === 2 && runAfter === 2) return 'keep'
  return 'skip'
}

/**
 * Restore single-tilde strikethrough to literal `~text~`, keeping `~~text~~`
 * strikethrough intact. Every `<del>` is located in the source independently;
 * a del whose rendered text cannot be traced back (nested markup heavier than
 * emphasis, links) is left struck rather than guessed at.
 * @param root - rendered container to fix.
 * @param sources - the Markdown source texts behind `root`, in render order.
 */
export function fixSingleTilde(root: HTMLElement, sources: readonly string[]): void {
  const dels = root.querySelectorAll('del')
  if (dels.length === 0) return
  const source = sources.join('\n')
  let cursor = 0
  for (const del of Array.from(dels)) {
    const content = del.textContent ?? ''
    if (content === '' || MARKER.test(content)) continue
    const match = matchSourceSpan(source, cursor, content)
    if (match === undefined) continue
    const [start, end] = match
    const action = resolveDelMarker(source, start, end)
    cursor = Math.min(source.length, end + (action === 'keep' ? 2 : 1))
    if (action !== 'restore') continue
    const restored = document.createDocumentFragment()
    restored.append(document.createTextNode('~'))
    while (del.firstChild !== null) restored.append(del.firstChild)
    restored.append(document.createTextNode('~'))
    del.replaceWith(restored)
  }
}
