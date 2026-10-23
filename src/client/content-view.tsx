/**
 * The message body renderers.
 *
 * Standard mode normally delegates to DSH's own assistant renderer. This module
 * owns the two modes that deliberately replace it, plus the self-sufficient
 * rich fallback used when no safe delegation target exists (see
 * `assistant-view.tsx`): the fallback still renders Markdown through DSH's own
 * `MarkdownText`, so it is a presentation fallback rather than a downgrade to
 * plain text.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { JsonBlock, MarkdownText, extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { dict } from './locale'

/** The durable image reference an image block carries. */
type AttachmentRef = Extract<AssistantBlock, { kind: 'image' }>['attachment']

/** One inline image resolved through the session-authorized loader. */
function InlineImage({ attachment, loadImage, alt }: {
  attachment: AttachmentRef
  loadImage: (attachment: AttachmentRef) => Promise<string>
  alt: string
}): ReactNode {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const url = await loadImage(attachment)
        if (active) setSource(url)
      } catch {
        // A missing loader or a refused attachment leaves the slot empty.
        if (active) setSource(null)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [attachment, loadImage])
  if (source === null) return null
  return <img className="mdv-image" src={source} alt={alt} />
}

/** Props of the message body renderers. */
export interface ContentViewProps {
  /** The assistant step's content blocks, in source order. */
  blocks: readonly AssistantBlock[]
  /**
   * `rich` renders Markdown through DSH's own renderer, `plain` strips the
   * markup, and `raw` shows the source.
   */
  mode: 'rich' | 'plain' | 'raw'
  /** Whether the step is still streaming. */
  streaming: boolean
  /** Whether the step belongs to an aborted turn. */
  interrupted: boolean
  /** Session-authorized image loader. */
  loadImage: (attachment: AttachmentRef) => Promise<string>
}

/**
 * Render one assistant step's body.
 * @param props - the step's blocks plus the mode to render them in.
 * @returns the message body.
 */
export function ContentView({ blocks, mode, streaming, interrupted, loadImage }: ContentViewProps): ReactNode {
  const L = dict()
  // MarkdownText reads the fence copy-button labels straight off this object and
  // discards its streaming render cache when the identity changes, so it is
  // memoized on the two strings rather than rebuilt per render.
  const codeLabels = useMemo(() => ({ copyLabel: L.copy, copiedLabel: L.copied }), [L.copy, L.copied])
  const rendered: ReactNode[] = []

  blocks.forEach((block, index) => {
    switch (block.kind) {
      case 'text': {
        if (mode === 'rich') {
          rendered.push(<MarkdownText key={index} text={block.text} streaming={streaming} codeLabels={codeLabels} />)
        } else if (mode === 'plain') {
          const text = extractMarkdownPlainText(block.text)
          if (text !== '') rendered.push(<p className="mdv-plain" key={index}>{text}</p>)
        } else {
          rendered.push(
            <pre className="mdv-raw" key={index}>
              <code>{block.text}</code>
            </pre>,
          )
        }
        break
      }
      case 'reasoning': {
        // Reasoning is prose, not Markdown, so only plain mode transforms it.
        const body = mode === 'plain' ? extractMarkdownPlainText(block.text) : block.text
        rendered.push(
          <details className="mdv-think" key={index}>
            <summary>{L.think}</summary>
            <div className="mdv-think-body">{body}</div>
          </details>,
        )
        break
      }
      case 'image':
        rendered.push(
          <div className="mdv-images" key={index}>
            <InlineImage attachment={block.attachment} loadImage={loadImage} alt={L.imageAlt} />
          </div>,
        )
        break
      case 'tool-call':
        // Tool calls render as their own Chat Nodes, exactly as in standard mode.
        break
      default:
        rendered.push(
          <JsonBlock
            key={index}
            label={L.unknownBlock}
            payload={block.block}
            truncatedLabel={(total: number) => `… (${total})`}
          />,
        )
    }
  })

  if (rendered.length === 0) rendered.push(<p className="mdv-empty" key="empty">{L.plainEmpty}</p>)

  return (
    <div className="mdv-content">
      {rendered}
      {interrupted ? <span className="mdv-stopped">{L.stopped}</span> : null}
    </div>
  )
}
