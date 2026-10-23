/**
 * The assistant-step Chat Node renderer.
 *
 * DSH renders assistant prose through its own assistant view, and no seat
 * narrower than the whole Chat Node exists for it. So this renderer claims the
 * `assistant-step` cell below the built-in and then *forwards to it*: the
 * shadowed entry is read back out of the slot registry, which keeps standard
 * rendering byte-identical to stock while the plugin still owns the decision.
 *
 * The trap is that the framework composes each entry's props from that entry's
 * own `inject` face, and in current builds the assistant renderer declares one
 * (it needs a `usePresentation` hook the framework binds). Calling its
 * component directly with this renderer's props would leave that hook
 * undefined and crash it. So this renderer **mirrors** the shadowed entry's
 * face — the stored factory is re-declared verbatim on this registration, the
 * framework binds the same hooks for both entries, and the forwarded props are
 * complete. If no delegable entry is registered, the plugin renders Markdown
 * itself through the platform's `MarkdownText` instead.
 */
import { Component, createElement, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { ContentView } from './content-view'
import { extractHeadings, useDomFeatures, type Heading } from './dom-features'
import { dict } from './locale'
import { isChatActive, useSettings } from './settings'

/** Props DSH delivers to one keyed Chat Node renderer. */
export type AssistantStepProps = ChatNodeViewProps<'assistant-step'>

/** The slot the assistant step is dispatched through. */
const SLOT = 'conversation.chat.node'

/** The cell this plugin claims. */
export const ASSISTANT_STEP_KEY = 'assistant-step'

/**
 * Shadowing rank for the claim. Keyed cells render their *lowest* live entry and
 * the built-in sits at the default 0, so anything below it wins the cell.
 */
export const REPLACEMENT_PRIORITY = -100

/** How many 50 ms ticks to wait for a delegable renderer to appear. */
const BUILTIN_RETRY_LIMIT = 20

/**
 * The stored business-face factory, widened away from its type-erased
 * signature. The parameter is the session id the framework passes to every
 * session-scoped entry.
 */
type InjectFactory = (sessionId: unknown) => Record<string, unknown>

/** The per-message table of contents, rendered from the Markdown source. */
function MessageToc({ headings }: { headings: readonly Heading[] }): ReactNode {
  const L = dict()
  if (headings.length < 2) return null
  return (
    <nav className="mdv-toc" aria-label={L.tocHeading}>
      <div className="mdv-toc-title">{L.tocHeading}</div>
      <ul className="mdv-toc-list">
        {headings.map((heading) => (
          <li key={heading.index} data-mdv-level={heading.level}>
            <a href={`#mdv-h-${heading.index}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Read the Markdown source of a message's text blocks, in order. */
function textSources(blocks: readonly { kind: string; text?: string }[]): string[] {
  const sources: string[] = []
  for (const block of blocks) {
    if (block.kind === 'text' && typeof block.text === 'string') sources.push(block.text)
  }
  return sources
}

/** Props of the degradation boundary. */
interface ViewBoundaryProps {
  /** Rendered when the plugin's own view throws. */
  fallback: ReactNode
  /** The plugin's view. */
  children: ReactNode
}

/**
 * Last line of defense.
 *
 * Claiming the assistant cell means this plugin sits in the path of every
 * assistant message, so a bug in its own view must degrade that one message
 * rather than blank the transcript. The boundary renders no element of its own,
 * so it never changes the standard-mode DOM.
 */
class ViewBoundary extends Component<ViewBoundaryProps, { failed: boolean }> {
  constructor(props: ViewBoundaryProps) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** What a plugin load contributes to the assistant-step cell. */
export interface AssistantStepClaim {
  /** The renderer to register. */
  component: (props: AssistantStepProps) => ReactNode
  /**
   * The business face to declare, mirroring whichever renderer is being
   * shadowed so the framework binds the same hooks for both.
   * @param args - the framework's own inject parameters.
   * @returns the mirrored face, or an empty one when nothing is delegable yet.
   */
  inject: InjectFactory
}

/**
 * Build the assistant-step contribution for one plugin load.
 * @param ctx - the plugin's client context, used to read the slot registry.
 * @returns the component and the inject face to register with it.
 */
export function createAssistantStepView(ctx: ClientContext): AssistantStepClaim {
  /**
   * Find the renderer this plugin is shadowing: the lowest-priority
   * `assistant-step` entry that is not this component itself.
   * @param self - this component, excluded from the search.
   * @returns the delegable renderer, or undefined while none is registered.
   */
  function findBuiltin(self: unknown): StoredEntry | undefined {
    const entries: readonly StoredEntry[] = ctx.slots.entries(SLOT)
    let best: StoredEntry | undefined
    for (const entry of entries) {
      if (entry.options.key !== ASSISTANT_STEP_KEY) continue
      if (entry.component === self) continue
      const priority = entry.options.priority ?? 0
      if (best === undefined || priority < (best.options.priority ?? 0)) best = entry
    }
    return best
  }

  function AssistantStepView(props: AssistantStepProps): ReactNode {
    const settings = useSettings()
    const wrapper = useRef<HTMLDivElement | null>(null)
    const [attempt, setAttempt] = useState(0)

    const builtin = findBuiltin(AssistantStepView)?.component as ComponentType<AssistantStepProps> | undefined
    const active = isChatActive(settings)
    const replacing = active && settings.mode !== 'standard'
    // The DOM pass decorates DSH's own output, so it runs in standard mode only.
    // The block sources drive the single-tilde restoration.
    const sources = useMemo(() => textSources(props.node.data.blocks), [props.node.data.blocks])
    useDomFeatures(wrapper, active && !replacing ? settings : null, sources)

    // The shadowed renderer arrives with its own plugin's load, which can trail
    // this plugin by a tick. Retry briefly rather than settling on the
    // standalone view for the rest of the session.
    useEffect(() => {
      if (builtin !== undefined || attempt >= BUILTIN_RETRY_LIMIT) return undefined
      const timer = window.setTimeout(() => setAttempt((value) => value + 1), 50)
      return () => window.clearTimeout(timer)
    }, [builtin, attempt])

    const data = props.node.data
    const loadImage = props.loadImage
    const streaming = data.status === 'running'
    const interrupted = data.status === 'interrupted'

    /**
     * Self-sufficient standard rendering, used when no renderer is registered
     * yet and as the boundary's degradation target. Markdown still goes through
     * DSH's own `MarkdownText`, so a message is never reduced to plain text.
     */
    const standalone = (
      <div className="mdv-root" data-mdv-mode="standard">
        <ContentView
          blocks={data.blocks}
          mode="rich"
          streaming={streaming}
          interrupted={interrupted}
          loadImage={loadImage}
        />
      </div>
    )

    // Off, or on with every feature at its default: hand DSH's own element back
    // untouched — no wrapper, no DOM pass, no boundary.
    if (!active) return builtin === undefined ? standalone : createElement(builtin, props)

    const headings = settings.toc ? extractHeadings(textSources(data.blocks)) : []

    const body = replacing ? (
      <div
        className="mdv-root"
        data-mdv-mode={settings.mode}
        data-mdv-width={settings.width}
        data-mdv-font={settings.fontSize}
      >
        <ContentView
          blocks={data.blocks}
          mode={settings.mode === 'raw' ? 'raw' : 'plain'}
          streaming={streaming}
          interrupted={interrupted}
          loadImage={loadImage}
        />
      </div>
    ) : (
      <div
        ref={wrapper}
        className="mdv-root"
        data-mdv-mode="standard"
        data-mdv-width={settings.width}
        data-mdv-font={settings.fontSize}
      >
        {headings.length >= 2 ? <MessageToc headings={headings} /> : null}
        {builtin === undefined
          ? (
              <ContentView
                blocks={data.blocks}
                mode="rich"
                streaming={streaming}
                interrupted={interrupted}
                loadImage={loadImage}
              />
            )
          : createElement(builtin, props)}
      </div>
    )

    return <ViewBoundary fallback={standalone}>{body}</ViewBoundary>
  }

  /**
   * Mirror the shadowed renderer's business face. The framework calls this with
   * the parameters the shadowed entry would have received, so re-declaring its
   * factory verbatim makes the framework bind the same hooks into this
   * renderer's props — which are then forwarded unchanged.
   */
  const inject: InjectFactory = (sessionId) => {
    try {
      const factory = findBuiltin(AssistantStepView)?.inject as unknown as InjectFactory | undefined
      return factory === undefined ? {} : factory(sessionId)
    } catch {
      // A face this renderer cannot mirror degrades to the standalone view.
      return {}
    }
  }

  return { component: AssistantStepView, inject }
}
