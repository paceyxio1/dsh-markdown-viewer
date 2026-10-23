/**
 * Browser half of dsh-plugin-markdown-viewer.
 *
 * Two contributions, one shared preference snapshot:
 * - `conversation.chat.node` / `assistant-step` — the rendering-mode switch.
 * - `settings.section` — the page the human flips it on.
 *
 * Both are registered through `ctx.slots.inject`, so the plugin activates
 * whenever its host slot appears and stays inert when a surface is composed
 * out. Nothing here throws on a missing peer: a plugin that cannot render must
 * still not break the transcript.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Loads the settings domain's slot contract, which is what declares
// `settings.section` in the global SlotMap. Type-only: nothing is imported at
// runtime, and the augmentation is the whole point.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ASSISTANT_STEP_KEY, REPLACEMENT_PRIORITY, createAssistantStepView } from './assistant-view'
import { extractHeadings } from './dom-features'
import { replaceShortcodes } from './emoji'
import { dict } from './locale'
import { MarkdownViewerSettingsPage } from './settings-page'
import { isActive, isChatActive, isSidebarActive, settingsStore } from './settings'
import { installSidebarPreview, resourceIdentity } from './sidebar-preview'
import { installStyles } from './styles'
import { matchSourceSpan, resolveDelMarker } from './tilde-restore'

export const name = 'markdown-viewer'

/** The slot registry is the only service this plugin needs. */
export const inject = ['slots']

/**
 * Test seam.
 *
 * The plugin's behavior is asserted against the *built* bundle, so the pure
 * helpers the smoke test drives are reachable from it. Nothing in the shipped
 * runtime reads this object.
 */
export const __testing = { settingsStore, extractHeadings, replaceShortcodes, isActive, isChatActive, isSidebarActive, resourceIdentity, matchSourceSpan, resolveDelMarker }

/**
 * Mount the plugin.
 * @param ctx - the client context; the caller's fiber owns both registrations.
 */
export function apply(ctx: ClientContext): void {
  installStyles()

  // Sidebar document previews render outside any slot this plugin can claim, so
  // they are personalized by an idempotent DOM decorator bound to this fiber.
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => installSidebarPreview(settingsStore), 'markdown-viewer: sidebar preview')
  }
  else {
    installSidebarPreview(settingsStore)
  }

  const claim = createAssistantStepView(ctx)
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key: ASSISTANT_STEP_KEY,
        // Keyed cells render their lowest live entry; the built-in sits at 0.
        priority: REPLACEMENT_PRIORITY,
        // The conversation namespace is what supplies the built-in renderer's
        // own `t` seat, which this renderer forwards to it untouched.
        locale: 'conversation',
        // Mirrors the shadowed renderer's business face so the framework binds
        // the same hooks for both (see assistant-view.tsx).
        inject: claim.inject,
      },
      claim.component,
    ),
  )

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'markdown-viewer',
        order: 60,
        // A thunk so the label follows the active locale at read time.
        label: () => dict().sectionLabel,
      },
      MarkdownViewerSettingsPage,
    ),
  )
}
