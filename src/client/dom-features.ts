/**
 * Content enhancements applied to the DOM DSH already rendered.
 *
 * Every transform here is *additive and idempotent*: a second pass over the
 * same subtree changes nothing, so the MutationObserver that drives streaming
 * messages converges instead of looping. Only attributes, text data and one
 * small anchor element are written — React's element tree is never re-parented,
 * which keeps reconciliation intact.
 */
import { useEffect, type RefObject } from 'react'
import { replaceShortcodes } from './emoji'
import { fixSingleTilde } from './tilde-restore'
import { dict, type Dictionary } from './locale'
import { COLLAPSE_CODE_LINES, type MarkdownViewerSettings } from './settings'

/** Elements whose text must never be rewritten (code, math sources, raw HTML). */
const SKIP_SELECTOR = 'pre, code, script, style, textarea, kbd, samp, .katex'

/** Prefix of every heading id this plugin assigns. */
const HEADING_ID_PREFIX = 'mdv-h-'

/** One heading discovered in a message's Markdown source. */
export interface Heading {
  /** 1-6, the ATX level. */
  level: number
  /** Display text with inline markup removed. */
  text: string
  /** Position in document order; also the heading's assigned id suffix. */
  index: number
}

/** Strip inline Markdown markup so a heading reads as plain text. */
function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/**
 * Collect the ATX headings of a message from its Markdown source.
 *
 * Reading the source rather than the rendered DOM keeps the table of contents a
 * pure React value: it renders in the same commit as the message, and the DOM
 * pass only has to stamp matching ids onto the headings it finds.
 * @param sources - the message's text blocks, in order.
 * @returns headings in document order.
 */
export function extractHeadings(sources: readonly string[]): Heading[] {
  const headings: Heading[] = []
  let fence: string | null = null
  for (const source of sources) {
    for (const rawLine of source.split('\n')) {
      const line = rawLine.trim()
      const fenceMatch = /^(`{3,}|~{3,})/.exec(line)
      if (fenceMatch !== null) {
        const marker = fenceMatch[1].charAt(0)
        if (fence === null) fence = marker
        else if (fence === marker) fence = null
        continue
      }
      if (fence !== null) continue
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (match === null) continue
      const text = stripInline(match[2])
      if (text === '') continue
      headings.push({ level: match[1].length, text, index: headings.length })
    }
  }
  return headings
}

/** Rewrite known emoji shortcodes in every eligible text node. */
function applyEmoji(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    if (!text.data.includes(':')) continue
    const parent = text.parentElement
    if (parent === null || parent.closest(SKIP_SELECTOR) !== null) continue
    targets.push(text)
  }
  for (const text of targets) {
    // Replacing makes the node stop matching, so this converges on one pass.
    const next = replaceShortcodes(text.data)
    if (next !== text.data) text.data = next
  }
}

/** Open external links in a new tab. */
function applyLinkTarget(root: HTMLElement): void {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) continue
    if (anchor.target !== '_blank') anchor.target = '_blank'
    const rel = anchor.getAttribute('rel') ?? ''
    if (!rel.includes('noreferrer')) anchor.setAttribute('rel', `${rel} noreferrer`.trim())
  }
}

/** Stamp a stable, position-derived id onto every rendered heading. */
function applyHeadingIds(root: HTMLElement): void {
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6')
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const id = `${HEADING_ID_PREFIX}${index}`
    if (heading.id !== id) heading.id = id
  }
}

/** Reveal a `#` anchor next to every heading. */
function applyHeadingAnchors(root: HTMLElement, dictionary: Dictionary): void {
  for (const heading of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    if (heading.id === '') continue
    // A child anchor cannot outlive its heading, so this never leaks.
    if (heading.querySelector(':scope > a.mdv-anchor') !== null) continue
    try {
      const anchor = document.createElement('a')
      anchor.className = 'mdv-anchor'
      anchor.href = `#${heading.id}`
      anchor.textContent = '#'
      anchor.setAttribute('aria-label', dictionary.anchorsTitle)
      heading.append(anchor)
    } catch {
      // A heading React is mid-replacement on: the next pass retries.
    }
  }
}

/** Mark long code blocks collapsible; a click toggles them, no extra element. */
function applyCodeCollapse(root: HTMLElement, dictionary: Dictionary): void {
  for (const pre of root.querySelectorAll<HTMLElement>('pre')) {
    if (pre.dataset.mdvCode !== undefined) continue
    const lines = (pre.textContent ?? '').split('\n').length
    if (lines <= COLLAPSE_CODE_LINES) continue
    pre.dataset.mdvCode = 'collapsed'
    pre.dataset.mdvHint = dictionary.expandCode
    pre.title = dictionary.expandCode
  }
}

/** Toggle one managed code block. */
function toggleCodeBlock(pre: HTMLElement, dictionary: Dictionary): void {
  const collapsed = pre.dataset.mdvCode === 'collapsed'
  const next = collapsed ? 'expanded' : 'collapsed'
  const hint = collapsed ? dictionary.collapseCode : dictionary.expandCode
  pre.dataset.mdvCode = next
  pre.dataset.mdvHint = hint
  pre.title = hint
}

/**
 * Run every enabled enhancement over one rendered message.
 * @param root - the plugin's wrapper around the message.
 * @param settings - current preference snapshot.
 * @param dictionary - localized copy for the controls this pass creates.
 * @param sources - Markdown sources behind `root` (drives the tilde fix).
 */
export function applyDomFeatures(root: HTMLElement, settings: MarkdownViewerSettings, dictionary: Dictionary, sources?: readonly string[]): void {
  if (settings.linkNewTab) applyLinkTarget(root)
  if (settings.emoji) applyEmoji(root)
  if (settings.toc || settings.headingAnchors) applyHeadingIds(root)
  if (settings.headingAnchors) applyHeadingAnchors(root, dictionary)
  if (settings.collapseCode) applyCodeCollapse(root, dictionary)
  if (settings.singleTildeLiteral && sources !== undefined) fixSingleTilde(root, sources)
}

/**
 * Apply the enhancements to a wrapper, and keep applying them as a streaming
 * message rewrites its own DOM.
 * @param ref - the wrapper element.
 * @param settings - current preference snapshot, or null to stay off entirely;
 * a change re-runs the pass.
 * @param sources - Markdown sources behind the wrapper (drives the tilde fix).
 */
export function useDomFeatures(ref: RefObject<HTMLElement | null>, settings: MarkdownViewerSettings | null, sources?: readonly string[]): void {
  useEffect(() => {
    const root = ref.current
    if (root === null || settings === null) return
    const dictionary = dict()
    let frame = 0
    const run = (): void => {
      frame = 0
      try {
        applyDomFeatures(root, settings, dictionary, sources)
      } catch {
        // A pass must never break the message it decorates.
      }
    }
    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(run)
    }
    run()
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const pre = target.closest<HTMLElement>('pre[data-mdv-code]')
      if (pre === null || !root.contains(pre)) return
      // A click that finishes a text selection is a copy, not a toggle.
      const selection = window.getSelection()
      if (selection !== null && !selection.isCollapsed) return
      toggleCodeBlock(pre, dictionary)
    }
    root.addEventListener('click', onClick)
    return () => {
      observer.disconnect()
      root.removeEventListener('click', onClick)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [ref, settings, sources])
}
