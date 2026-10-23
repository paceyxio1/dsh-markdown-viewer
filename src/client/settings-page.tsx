/**
 * The plugin's settings page.
 *
 * Registered as a `settings.section` entry, so DSH's own settings shell owns
 * the navigation, the dialog chrome and the close affordance, and this module
 * only draws rows. Every control writes through the shared store, which is what
 * makes a change visible in the transcript immediately — the assistant renderer
 * subscribes to the same snapshot.
 */
import { useState, type ReactNode } from 'react'
import { dict } from './locale'
import {
  settingsStore,
  useSettings,
  type ContentWidth,
  type FontScale,
  type RenderMode,
  type RenderScope,
} from './settings'

/** A labeled on/off control. */
function Switch({ checked, onChange, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="mdv-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="mdv-switch-knob" />
    </button>
  )
}

/** One preference row: copy on the left, control on the right. */
function Row({ title, desc, disabled, children }: {
  title: string
  desc?: string | undefined
  disabled?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <div className={disabled === true ? 'mdv-row mdv-disabled' : 'mdv-row'}>
      <div className="mdv-row-text">
        <div className="mdv-row-title">{title}</div>
        {desc !== undefined ? <div className="mdv-row-desc">{desc}</div> : null}
      </div>
      <div className="mdv-row-control">{children}</div>
    </div>
  )
}

/** A segmented radio group for short option sets. */
function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (next: T) => void
}): ReactNode {
  return (
    <div className="mdv-segmented" role="group">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="mdv-segment"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A native select for longer option sets. */
function Select<T extends string>({ value, options, onChange, label, disabled }: {
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (next: T) => void
  label: string
  disabled?: boolean
}): ReactNode {
  return (
    <select
      className="mdv-select"
      aria-label={label}
      value={value}
      disabled={disabled === true}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  )
}

/** The registered `settings.section` page. */
export function MarkdownViewerSettingsPage(): ReactNode {
  const settings = useSettings()
  const L = dict()
  const [resetDone, setResetDone] = useState(false)

  const modes: readonly { id: RenderMode; label: string }[] = [
    { id: 'standard', label: L.modeStandard },
    { id: 'plain', label: L.modePlain },
    { id: 'raw', label: L.modeRaw },
  ]
  const modeNotes: Record<RenderMode, string> = {
    standard: L.modeStandardDesc,
    plain: L.modePlainDesc,
    raw: L.modeRawDesc,
  }
  const widths: readonly { id: ContentWidth; label: string }[] = [
    { id: 'default', label: L.widthDefault },
    { id: 'wide', label: L.widthWide },
    { id: 'full', label: L.widthFull },
    { id: 'narrow', label: L.widthNarrow },
  ]
  const scales: readonly { id: FontScale; label: string }[] = [
    { id: 'default', label: L.fontDefault },
    { id: 'compact', label: L.fontCompact },
    { id: 'comfortable', label: L.fontComfortable },
  ]
  const scopes: readonly { id: RenderScope; label: string }[] = [
    { id: 'chat', label: L.scopeChat },
    { id: 'sidebar', label: L.scopeSidebar },
    { id: 'both', label: L.scopeBoth },
  ]

  // The content switches decorate DSH's own rendering, which the two
  // replacement modes do not use.
  const contentDisabled = settings.mode !== 'standard'

  const reset = (): void => {
    settingsStore.reset()
    setResetDone(true)
    window.setTimeout(() => setResetDone(false), 2000)
  }

  return (
    <div className="mdv-settings">
      <h2 className="mdv-settings-title">{L.title}</h2>
      <p className="mdv-settings-intro">{L.intro}</p>

      <Row title={L.enabledTitle} desc={L.enabledDesc}>
        <Switch
          checked={settings.enabled}
          label={L.enabledTitle}
          onChange={(next) => settingsStore.patch({ enabled: next })}
        />
      </Row>

      <Row title={L.scopeTitle} desc={L.scopeDesc} disabled={!settings.enabled}>
        <Select
          value={settings.scope}
          options={scopes}
          label={L.scopeTitle}
          disabled={!settings.enabled}
          onChange={(next) => settingsStore.patch({ scope: next })}
        />
      </Row>

      <Row title={L.modeTitle} desc={L.modeDesc}>
        <Segmented
          value={settings.mode}
          options={modes}
          onChange={(next) => settingsStore.patch({ mode: next })}
        />
      </Row>
      <p className="mdv-mode-note">{modeNotes[settings.mode]}</p>

      <div className={settings.enabled ? 'mdv-group' : 'mdv-group mdv-disabled'}>
        <div className="mdv-group-title">{L.contentTitle}</div>
        <Row title={L.emojiTitle} desc={L.emojiDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.emoji}
            label={L.emojiTitle}
            onChange={(next) => settingsStore.patch({ emoji: next })}
          />
        </Row>
        <Row title={L.tocTitle} desc={L.tocDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.toc}
            label={L.tocTitle}
            onChange={(next) => settingsStore.patch({ toc: next })}
          />
        </Row>
        <Row title={L.anchorsTitle} desc={L.anchorsDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.headingAnchors}
            label={L.anchorsTitle}
            onChange={(next) => settingsStore.patch({ headingAnchors: next })}
          />
        </Row>
        <Row title={L.linkTitle} desc={L.linkDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.linkNewTab}
            label={L.linkTitle}
            onChange={(next) => settingsStore.patch({ linkNewTab: next })}
          />
        </Row>
        <Row title={L.collapseTitle} desc={L.collapseDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.collapseCode}
            label={L.collapseTitle}
            onChange={(next) => settingsStore.patch({ collapseCode: next })}
          />
        </Row>
        <Row title={L.tildeTitle} desc={L.tildeDesc} disabled={contentDisabled}>
          <Switch
            checked={settings.singleTildeLiteral}
            label={L.tildeTitle}
            onChange={(next) => settingsStore.patch({ singleTildeLiteral: next })}
          />
        </Row>
      </div>

      <div className={settings.enabled ? 'mdv-group' : 'mdv-group mdv-disabled'}>
        <div className="mdv-group-title">{L.layoutTitle}</div>
        <Row title={L.widthTitle} desc={L.layoutDesc}>
          <Select
            value={settings.width}
            options={widths}
            label={L.widthTitle}
            onChange={(next) => settingsStore.patch({ width: next })}
          />
        </Row>
        <Row title={L.fontTitle}>
          <Select
            value={settings.fontSize}
            options={scales}
            label={L.fontTitle}
            onChange={(next) => settingsStore.patch({ fontSize: next })}
          />
        </Row>
      </div>

      <button type="button" className="mdv-reset" onClick={reset}>
        {L.reset}
      </button>
      {resetDone ? <span className="mdv-reset-done">{L.resetDone}</span> : null}
    </div>
  )
}
