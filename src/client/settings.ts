/**
 * The plugin's own preference model.
 *
 * DSH's durable settings live behind a Host-registered namespace, which would
 * force a server half and an async load before the first render. This plugin is
 * a pure presentation switch, so its preferences live in `localStorage`: they
 * are read synchronously (no loading state, no flash of default rendering) and
 * survive reloads of the Web GUI. `patch` is the only write path, so the
 * snapshot identity stays stable between changes and `useSyncExternalStore`
 * never loops.
 */
import { useSyncExternalStore } from 'react'

/** How assistant Markdown is rendered. */
export type RenderMode = 'standard' | 'plain' | 'raw'

/** Maximum content width of one rendered message. */
export type ContentWidth = 'default' | 'wide' | 'full' | 'narrow'

/** Body text scale of one rendered message. */
export type FontScale = 'default' | 'compact' | 'comfortable'

/** Where the rendering preferences are applied. */
export type RenderScope = 'chat' | 'sidebar' | 'both'

/** Every preference this plugin owns. */
export interface MarkdownViewerSettings {
  /** Master switch: off leaves DSH's own rendering completely untouched. */
  enabled: boolean
  /** Which surfaces the preferences apply to. */
  scope: RenderScope
  /** The rendering mode applied to assistant messages. */
  mode: RenderMode
  /** Convert GitHub emoji shortcodes (`:smile:`) into emoji. */
  emoji: boolean
  /** Prepend a table of contents when a message has two or more headings. */
  toc: boolean
  /** Reveal a `#` anchor next to every heading. */
  headingAnchors: boolean
  /** Open external links in a new tab. */
  linkNewTab: boolean
  /** Collapse code blocks longer than {@link COLLAPSE_CODE_LINES}. */
  collapseCode: boolean
  /**
   * Restore single-`~` strikethrough to literal tildes. DSH's parser keeps the
   * upstream singleTilde default, striking `~text~` although GFM reserves
   * strikethrough for `~~text~~`.
   */
  singleTildeLiteral: boolean
  /** Maximum content width. */
  width: ContentWidth
  /** Body text scale. */
  fontSize: FontScale
}

/** Rendered lines above which a fenced code block becomes collapsible. */
export const COLLAPSE_CODE_LINES = 24

/** The shipped defaults: enabled, chat only, rendering exactly as DSH does. */
export const DEFAULT_SETTINGS: MarkdownViewerSettings = {
  enabled: true,
  scope: 'chat',
  mode: 'standard',
  emoji: false,
  toc: false,
  headingAnchors: false,
  linkNewTab: false,
  collapseCode: false,
  singleTildeLiteral: false,
  width: 'default',
  fontSize: 'default',
}

/** localStorage key holding the serialized preferences. */
const STORAGE_KEY = 'dsh-markdown-viewer/settings/v1'

const MODES: readonly RenderMode[] = ['standard', 'plain', 'raw']
const SCOPES: readonly RenderScope[] = ['chat', 'sidebar', 'both']
const WIDTHS: readonly ContentWidth[] = ['default', 'wide', 'full', 'narrow']
const FONT_SCALES: readonly FontScale[] = ['default', 'compact', 'comfortable']

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Narrow an untrusted stored object onto the current preference shape. */
function coerce(raw: unknown): MarkdownViewerSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS }
  const source = raw as Record<string, unknown>
  return {
    enabled: pickBoolean(source.enabled, DEFAULT_SETTINGS.enabled),
    scope: pickEnum(source.scope, SCOPES, DEFAULT_SETTINGS.scope),
    mode: pickEnum(source.mode, MODES, DEFAULT_SETTINGS.mode),
    emoji: pickBoolean(source.emoji, DEFAULT_SETTINGS.emoji),
    toc: pickBoolean(source.toc, DEFAULT_SETTINGS.toc),
    headingAnchors: pickBoolean(source.headingAnchors, DEFAULT_SETTINGS.headingAnchors),
    linkNewTab: pickBoolean(source.linkNewTab, DEFAULT_SETTINGS.linkNewTab),
    collapseCode: pickBoolean(source.collapseCode, DEFAULT_SETTINGS.collapseCode),
    singleTildeLiteral: pickBoolean(source.singleTildeLiteral, DEFAULT_SETTINGS.singleTildeLiteral),
    width: pickEnum(source.width, WIDTHS, DEFAULT_SETTINGS.width),
    fontSize: pickEnum(source.fontSize, FONT_SCALES, DEFAULT_SETTINGS.fontSize),
  }
}

function readStored(): MarkdownViewerSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) return { ...DEFAULT_SETTINGS }
    return coerce(JSON.parse(stored))
  } catch {
    // Private mode, a disabled store, or corrupt JSON: defaults still render.
    return { ...DEFAULT_SETTINGS }
  }
}

function writeStored(settings: MarkdownViewerSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A refused write must not break rendering; the value stays session-local.
  }
}

/** Read/write handle over the preference snapshot. */
export interface SettingsStore {
  /** Current snapshot; stable reference until the next change. */
  getSnapshot(): MarkdownViewerSettings
  /** Observe snapshot replacements. */
  subscribe(listener: () => void): () => void
  /** Merge a partial change and persist it. */
  patch(patch: Partial<MarkdownViewerSettings>): void
  /** Restore every shipped default. */
  reset(): void
}

function createSettingsStore(): SettingsStore {
  let state = readStored()
  const listeners = new Set<() => void>()
  const publish = (next: MarkdownViewerSettings): void => {
    state = next
    writeStored(next)
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    patch(patch) {
      publish(coerce({ ...state, ...patch }))
    },
    reset() {
      publish({ ...DEFAULT_SETTINGS })
    },
  }
}

/** The process-wide store. One plugin load owns one store. */
export const settingsStore = createSettingsStore()

/** Subscribe one component to the preference snapshot. */
export function useSettings(): MarkdownViewerSettings {
  // The store is readable synchronously, so it is its own server snapshot; this
  // keeps the components renderable outside a browser (tests, SSR).
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot)
}

/**
 * Whether a snapshot asks for any work beyond DSH's own rendering. When this is
 * false the plugin renders the built-in assistant view verbatim, with no
 * wrapper element and no DOM pass, so "on with defaults" is byte-identical to
 * the plugin being absent.
 * @param settings - current preference snapshot.
 * @returns whether any mode or content feature is active.
 */
export function isActive(settings: MarkdownViewerSettings): boolean {
  if (!settings.enabled) return false
  return settings.mode !== 'standard'
    || settings.emoji
    || settings.toc
    || settings.headingAnchors
    || settings.linkNewTab
    || settings.collapseCode
    || settings.singleTildeLiteral
    || settings.width !== 'default'
    || settings.fontSize !== 'default'
}

/**
 * Whether the preferences reach the conversation (assistant messages). Honored
 * by the assistant-step renderer.
 * @param settings - current preference snapshot.
 * @returns whether the chat surface is in scope.
 */
export function isChatActive(settings: MarkdownViewerSettings): boolean {
  return isActive(settings) && (settings.scope === 'chat' || settings.scope === 'both')
}

/**
 * Whether the preferences reach the sidebar document preview. Honored by the
 * sidebar preview installer.
 * @param settings - current preference snapshot.
 * @returns whether the sidebar preview surface is in scope.
 */
export function isSidebarActive(settings: MarkdownViewerSettings): boolean {
  return isActive(settings) && (settings.scope === 'sidebar' || settings.scope === 'both')
}
