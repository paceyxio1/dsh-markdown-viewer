/**
 * Personalization of the sidebar document preview.
 *
 * The right-sidebar preview of a Markdown workspace file is rendered by
 * `ui-sidebar-documentpreview`, which exposes no slot a plugin can claim. Like
 * the chat content features, this module therefore works as an idempotent DOM
 * decorator — but over surfaces it does not own, so it never mutates React's
 * children: replacement modes HIDE the native output with a CSS rule driven by
 * a container attribute and APPEND a sibling carrying the plugin's rendering.
 * Removing the additions restores the native preview exactly.
 *
 * The source text for plain/raw modes (and the ToC) comes from the same
 * `workspaceFiles/read` endpoint the preview itself uses; the wire envelope is
 * the typert gateway's client-request shape.
 */
import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { applyDomFeatures, extractHeadings } from './dom-features'
import { fixSingleTilde } from './tilde-restore'
import { dict, type Dictionary } from './locale'
import { isSidebarActive, type MarkdownViewerSettings, type SettingsStore } from './settings'

/** The preview-kind marker value on the sidebar preview container. */
const MARKDOWN_PREVIEW_KIND = 'documentpreview/markdown'

/** Resource-url shape that carries the session id and the file's path. */
const RESOURCE_URL = /dsh-resource:\/\/file\/session\/([^/]+)\/(.+)$/

/** Source fetches kept per file so repeated passes never re-hit the wire. */
const sourceCache = new Map<string, Promise<string | undefined>>()

/** Cap the cache; oldest entries drop first (insertion order). */
const SOURCE_CACHE_LIMIT = 30

/**
 * Read a workspace file's text through the host gateway, exactly the call the
 * preview itself makes.
 * @param sessionId - owning session of the file scope.
 * @param path - workspace-relative file path.
 * @returns the file text, or undefined when it cannot be read.
 */
function fetchDocumentSource(sessionId: string, path: string): Promise<string | undefined> {
  const key = `${sessionId}\n${path}`
  const cached = sourceCache.get(key)
  if (cached !== undefined) return cached
  const pending = (async (): Promise<string | undefined> => {
    try {
      const response = await fetch('/api/workspaceFiles/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `markdown-viewer:${key}`,
          method: 'workspaceFiles/read',
          payload: { args: { workspaceFileScopeId: sessionId, path, range: {} } },
        }),
      })
      const envelope: unknown = await response.json()
      const result = (envelope as { result?: { ok?: boolean; value?: { text?: unknown } } }).result
      if (result?.ok === true && typeof result.value?.text === 'string') return result.value.text
      return undefined
    } catch {
      return undefined
    }
  })()
  if (sourceCache.size >= SOURCE_CACHE_LIMIT) {
    const oldest = sourceCache.keys().next().value
    if (oldest !== undefined) sourceCache.delete(oldest)
  }
  sourceCache.set(key, pending)
  return pending
}

/** Parse the preview container's resource url into session id and path. */
export function resourceIdentity(container: HTMLElement): { sessionId: string; path: string } | undefined {
  const match = RESOURCE_URL.exec(container.getAttribute('data-textpreview-url') ?? '')
  if (match === null) return undefined
  // The url percent-encodes the file name (e.g. 【酒钢】), while the read API
  // expects the decoded workspace-relative path.
  let path = match[2]
  try {
    path = decodeURIComponent(path)
  } catch {
    // Malformed encoding: fall back to the raw form.
  }
  return { sessionId: match[1], path }
}

/** Publish the layout preferences as container attributes (declarative CSS). */
function applyLayoutAttributes(container: HTMLElement, settings: MarkdownViewerSettings): void {
  if (settings.fontSize !== 'default') container.setAttribute('data-mdv-font', settings.fontSize)
  if (settings.width !== 'default') container.setAttribute('data-mdv-width', settings.width)
}

/**
 * Apply the current preferences to one Markdown preview container. Safe to call
 * on every pass: every mutation is idempotent, and when the preferences no
 * longer cover the sidebar every addition is removed again.
 */
function personalizeContainer(container: HTMLElement, settings: MarkdownViewerSettings, dictionary: Dictionary): void {
  const body = container.querySelector<HTMLElement>('[data-document-markdown]')
  container.removeAttribute('data-mdv-font')
  container.removeAttribute('data-mdv-width')
  if (body === null) return

  const active = isSidebarActive(settings)
  const mode = active ? settings.mode : 'standard'
  const replacement = body.querySelector<HTMLElement>(':scope > [data-mdv-sidebar]')

  if (!active || mode === 'standard') {
    // Native rendering stands; drop any replacement from a previous pass.
    container.removeAttribute('data-mdv-sidebar-mode')
    if (replacement !== null) replacement.remove()
    const staleToc = body.querySelector(':scope > [data-mdv-sidebar-toc]')
    if (staleToc !== null) staleToc.remove()
    if (!active) return
    // Typography applies in every mode, including standard.
    applyLayoutAttributes(container, settings)
    try {
      applyDomFeatures(body, settings, dictionary)
    } catch {
      // Decoration must never break the preview.
    }
    decorateToc(container, body, settings, dictionary)
    restoreSingleTildes(container, body, settings)
    return
  }

  // plain / raw: hide the native output by attribute, append the replacement.
  container.setAttribute('data-mdv-sidebar-mode', mode)
  applyLayoutAttributes(container, settings)
  if (replacement !== null) {
    replacement.className = mode === 'raw' ? 'mdv-raw' : 'mdv-plain'
    return
  }
  const target = document.createElement('div')
  target.setAttribute('data-mdv-sidebar', '')
  target.textContent = '…'
  body.append(target)
  const identity = resourceIdentity(container)
  if (identity === undefined) {
    target.textContent = dictionary.sourceUnavailable
    target.className = mode === 'raw' ? 'mdv-raw' : 'mdv-plain'
    return
  }
  target.className = mode === 'raw' ? 'mdv-raw' : 'mdv-plain'
  void fetchDocumentSource(identity.sessionId, identity.path).then((source) => {
    if (!target.isConnected) return
    target.textContent = source === undefined
      ? dictionary.sourceUnavailable
      : mode === 'raw' ? source : extractMarkdownPlainText(source)
  })
}

/** Restore single-`~` strikethrough to literal tildes once the source arrives. */
function restoreSingleTildes(container: HTMLElement, body: HTMLElement, settings: MarkdownViewerSettings): void {
  if (!settings.singleTildeLiteral) return
  if (body.querySelector('del') === null) return
  const identity = resourceIdentity(container)
  if (identity === undefined) return
  void fetchDocumentSource(identity.sessionId, identity.path).then((source) => {
    if (source === undefined || !body.isConnected) return
    try {
      fixSingleTilde(body, [source])
    } catch {
      // A failed pass leaves the native rendering untouched.
    }
  })
}

/** Prepend the table of contents for the previewed document, built from source. */
function decorateToc(container: HTMLElement, body: HTMLElement, settings: MarkdownViewerSettings, dictionary: Dictionary): void {
  if (!settings.toc) return
  if (body.querySelector(':scope > [data-mdv-sidebar-toc]') !== null) return
  const identity = resourceIdentity(container)
  if (identity === undefined) return
  void fetchDocumentSource(identity.sessionId, identity.path).then((source) => {
    if (source === undefined || !body.isConnected) return
    if (body.querySelector(':scope > [data-mdv-sidebar-toc]') !== null) return
    const headings = extractHeadings([source])
    if (headings.length < 2) return
    const nav = document.createElement('nav')
    nav.className = 'mdv-toc'
    nav.setAttribute('data-mdv-sidebar-toc', '')
    nav.setAttribute('aria-label', dictionary.tocHeading)
    const title = document.createElement('div')
    title.className = 'mdv-toc-title'
    title.textContent = dictionary.tocHeading
    const list = document.createElement('ul')
    list.className = 'mdv-toc-list'
    for (const heading of headings) {
      const item = document.createElement('li')
      item.setAttribute('data-mdv-level', String(heading.level))
      const anchor = document.createElement('a')
      anchor.href = `#mdv-h-${heading.index}`
      anchor.textContent = heading.text
      item.append(anchor)
      list.append(item)
    }
    nav.append(title, list)
    body.prepend(nav)
  })
}

/** Toggle a managed code block; the chat wrapper handles its own clicks. */
function onDocumentClick(event: MouseEvent, dictionary: Dictionary): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const pre = target.closest('pre[data-mdv-code]')
  if (pre === null || !document.contains(pre)) return
  if (pre.closest('.mdv-root') !== null) return
  const selection = window.getSelection()
  if (selection !== null && !selection.isCollapsed) return
  const code = pre as HTMLElement
  const collapsed = code.getAttribute('data-mdv-code') === 'collapsed'
  const hint = collapsed ? dictionary.collapseCode : dictionary.expandCode
  code.setAttribute('data-mdv-code', collapsed ? 'expanded' : 'collapsed')
  code.setAttribute('data-mdv-hint', hint)
  code.title = hint
}

/**
 * Start personalizing sidebar previews for the life of the calling fiber.
 * @param store - the preference store to follow.
 * @returns the disposer.
 */
export function installSidebarPreview(store: SettingsStore): () => void {
  if (
    typeof document === 'undefined'
    || !document.body
    || typeof document.querySelectorAll !== 'function'
    || typeof document.addEventListener !== 'function'
    || typeof MutationObserver === 'undefined'
  ) {
    return () => {}
  }
  const dictionary = dict()
  let frame = 0
  const run = (): void => {
    frame = 0
    const settings = store.getSnapshot()
    for (const container of document.querySelectorAll<HTMLElement>('[data-document-preview]')) {
      if ((container.getAttribute('data-document-preview') ?? '').includes(MARKDOWN_PREVIEW_KIND)) {
        try {
          personalizeContainer(container, settings, dictionary)
        } catch {
          // One broken preview must not stop the others.
        }
      }
    }
  }
  const schedule = (): void => {
    if (frame === 0) frame = window.requestAnimationFrame(run)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  const unsubscribe = store.subscribe(schedule)
  const onClick = (event: MouseEvent): void => onDocumentClick(event, dictionary)
  document.addEventListener('click', onClick)
  run()
  return () => {
    observer.disconnect()
    unsubscribe()
    document.removeEventListener('click', onClick)
    if (frame !== 0) window.cancelAnimationFrame(frame)
  }
}
