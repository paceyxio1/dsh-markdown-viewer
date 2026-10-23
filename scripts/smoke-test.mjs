/**
 * Behavioral smoke test for the built client bundle.
 *
 * It drives `client.js` exactly as DSH's browser module loader does — through
 * `window.__ModuleLoader__.load({id, factory})` with the platform modules
 * supplied by `require` — and then renders the registered components with real
 * React. That makes the checks assertions about the artifact that actually
 * ships, not about a re-imported copy of the sources.
 *
 * The host packages this bundle requires at runtime are replaced by small
 * stubs: the built-in assistant renderer it shadows, and the Markdown
 * primitives it calls. Everything else is the real thing.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

const react = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const jsxRuntime = require('react/jsx-runtime')

const BUNDLE_ID = 'dsh-plugin-markdown-viewer'
const STORAGE_KEY = 'dsh-markdown-viewer/settings/v1'
const CHAT_SLOT = 'conversation.chat.node'
const SECTION_SLOT = 'settings.section'
const BUNDLE = readFileSync(join(root, 'client.js'), 'utf8')

let passed = 0
/** @param {string} label */
function check(label) {
  passed += 1
  console.log(`  ok  ${label}`)
}

// --- browser shims ---------------------------------------------------------

/**
 * Install the globals the browser bundle expects.
 * @param {Map<string, string>} storage - backing store for localStorage.
 * @returns {() => object} reads the spec the bundle registered.
 */
function installShims(storage) {
  let loaded = null
  globalThis.window = {
    __ModuleLoader__: {
      load(spec) {
        loaded = spec
      },
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getSelection: () => null,
  }
  globalThis.document = {
    documentElement: { lang: '' },
    getElementById: () => null,
    createElement: () => ({ dataset: {}, style: {}, id: '', textContent: '', append() {}, setAttribute() {} }),
    head: { append() {} },
    createTreeWalker: () => ({ nextNode: () => null }),
    querySelector: () => null,
  }
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
  globalThis.NodeFilter = { SHOW_TEXT: 4 }
  return () => {
    if (loaded === null) throw new Error('the bundle never called window.__ModuleLoader__.load')
    return loaded
  }
}

// --- host module stubs -----------------------------------------------------

const primitives = {
  MarkdownText: ({ text }) => react.createElement('div', { className: 'stub-markdown' }, text),
  JsonBlock: () => react.createElement('div', { className: 'stub-json' }),
  extractMarkdownPlainText: (text) =>
    text
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/[*`_~]/g, '')
      .trim(),
}

const STUBS = {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

/** The renderer this plugin shadows, standing in for DSH's assistant view. */
function BuiltinAssistantView({ node }) {
  return react.createElement(
    'div',
    { className: 'stub-builtin' },
    node.data.blocks.map((block, index) =>
      block.kind === 'text' ? react.createElement('div', { key: index }, block.text) : null,
    ),
  )
}

// --- harness ---------------------------------------------------------------

/**
 * Stands in for ui-chat's transcript renderer: it declares its own `inject`
 * face and therefore needs a hook only the framework can bind. Calling it
 * directly must never happen.
 */
function InjectedAssistantView({ usePresentation }) {
  if (typeof usePresentation !== 'function') throw new Error('usePresentation is not a function')
  return react.createElement('div', { className: 'stub-injected' })
}

/** The inject face that stub declares. */
const INJECTED_FACE = { hooks: { presentation: () => () => false } }

/**
 * Evaluate the bundle and mount it against a fake slot registry.
 * @param {object} [seed] - settings to seed localStorage with before load.
 * @param {object} [options] - which peer renderers the registry publishes.
 */
function mount(seed, options = {}) {
  const storage = new Map()
  if (seed !== undefined) storage.set(STORAGE_KEY, JSON.stringify(seed))
  const takeLoaded = installShims(storage)
  // eslint-disable-next-line no-new-func -- the bundle is a browser script.
  new Function(BUNDLE)()
  const spec = takeLoaded()
  assert.equal(spec.id, BUNDLE_ID, 'bundle registers under its own package name')
  assert.equal(typeof spec.factory, 'function', 'bundle exposes a factory')
  const exports = spec.factory((id) => {
    if (!(id in STUBS)) throw new Error(`client bundle required an unexpected module: ${id}`)
    return STUBS[id]
  })

  const registrations = []
  const slotEntries = []
  const ctx = {
    slots: {
      inject: (_name, callback) => {
        callback()
        return () => {}
      },
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
      entries: (name) => (name === CHAT_SLOT ? slotEntries : []),
    },
    effect: (callback) => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  exports.apply(ctx)

  const claim = registrations.find((entry) => entry.options.name === CHAT_SLOT)
  const section = registrations.find((entry) => entry.options.name === SECTION_SLOT)
  // The registry holds this plugin's claim alongside the peers it shadows.
  slotEntries.push({ options: { key: 'assistant-step', priority: -100 }, component: claim.component })
  if (options.noPeers !== true) {
    if (options.injectEntry === true) {
      // Ranks *below* the plain renderer, so the mirroring path is exercised.
      slotEntries.push({
        options: { key: 'assistant-step', priority: -50 },
        component: InjectedAssistantView,
        inject: () => INJECTED_FACE,
      })
    }
    slotEntries.push({ options: { key: 'assistant-step', priority: 0 }, component: BuiltinAssistantView })
  }

  return { exports, storage, registrations, claim, section }
}

/** Props DSH hands the assistant-step renderer. */
function assistantProps(blocks) {
  return {
    node: { kind: 'assistant-step', data: { status: 'settled', turn: 1, step: 1, time: 0, blocks } },
    loadImage: () => Promise.resolve(''),
    openFile() {},
    inspectCall() {},
    forkAt() {},
    fileMentions: () => undefined,
    t: (key) => key,
    useTurnData: () => undefined,
  }
}

/** @param {unknown} component @param {object} props */
function render(component, props) {
  return renderToStaticMarkup(react.createElement(component, props))
}

/**
 * Render this plugin's claim the way the slot framework does: run the
 * registration's inject factory and bind each `hooks` member into a `use<Name>`
 * prop, then hand the composed props to the component.
 * @param {object} claim - one `conversation.chat.node` registration.
 * @param {object} props - the owner and runtime props.
 */
function renderClaim(claim, props) {
  const composed = { ...props }
  const face = typeof claim.options.inject === 'function' ? claim.options.inject('session-test') : {}
  for (const [name, factory] of Object.entries(face?.hooks ?? {})) {
    composed[`use${name.charAt(0).toUpperCase()}${name.slice(1)}`] = factory()
  }
  return render(claim.component, composed)
}

// --- contract --------------------------------------------------------------

console.log('bundle contract')
{
  const { exports, registrations, claim, section } = mount()
  assert.deepEqual(exports.inject, ['slots'], 'declares only the slots service')
  check('exports apply/inject and the test seam')

  assert.equal(registrations.length, 2, 'registers exactly two slots')
  assert.equal(claim.options.key, 'assistant-step')
  assert.equal(claim.options.priority, -100, 'shadows the built-in at priority -100')
  assert.equal(claim.options.locale, 'conversation', 'takes the conversation locale seat')
  assert.equal(typeof claim.component, 'function')
  assert.equal(typeof claim.options.inject, 'function', 'declares a mirrored business face')
  check('claims conversation.chat.node / assistant-step below the built-in')

  assert.equal(section.options.id, 'markdown-viewer')
  assert.equal(section.options.order, 60)
  assert.equal(typeof section.options.label, 'function', 'section label is a locale thunk')
  check('contributes one settings.section page')
}

// --- delegation safety -----------------------------------------------------

console.log('delegation safety')
{
  const props = assistantProps([{ kind: 'text', text: '# Title\n\nHello **world**' }])

  // A peer that declares its own inject face is the one real builds ship, so the
  // registration must mirror that face or the forwarded props are incomplete.
  const mirrored = mount(undefined, { injectEntry: true })
  const face = mirrored.claim.options.inject('session-test')
  assert.equal(
    typeof face?.hooks?.presentation,
    'function',
    'the shadowed entry\'s business face is mirrored onto this registration',
  )
  check('mirrors the shadowed renderer\'s inject face')

  const composed = renderClaim(mirrored.claim, props)
  assert.ok(
    composed.includes('stub-injected'),
    'the inject-bearing peer renders once the framework binds its hooks',
  )
  check('an inject-bearing renderer is delegated to with its hooks bound')

  const noPeers = mount(undefined, { noPeers: true })
  const solo = renderClaim(noPeers.claim, props)
  assert.ok(solo.includes('stub-markdown'), 'the standalone view renders Markdown itself')
  assert.ok(!solo.includes('stub-injected'), 'nothing is called when no peer is registered')
  check('with no peer the plugin renders Markdown itself')

  const standaloneActive = mount(undefined, { noPeers: true })
  standaloneActive.exports.__testing.settingsStore.patch({ emoji: true })
  const standaloneMarkup = renderClaim(standaloneActive.claim, props)
  assert.ok(standaloneMarkup.includes('data-mdv-mode="standard"'), 'the standalone path is switchable')
  assert.ok(standaloneMarkup.includes('stub-markdown'), 'features decorate the standalone Markdown')
  check('the standalone path honours the settings too')
}

// --- the inert path --------------------------------------------------------

console.log('inert by default')
{
  const { claim } = mount()
  const props = assistantProps([{ kind: 'text', text: '# Title\n\nHello **world**' }])
  const viaPlugin = renderClaim(claim, props)
  const direct = render(BuiltinAssistantView, props)
  assert.equal(viaPlugin, direct, 'default settings forward the built-in untouched')
  assert.ok(!viaPlugin.includes('mdv-root'), 'no wrapper element is introduced')
  check('shipped defaults render byte-identical to the built-in')

  const off = mount({ enabled: false, mode: 'plain', emoji: true })
  assert.equal(renderClaim(off.claim, props), direct, 'the master switch disables everything')
  check('master switch off is byte-identical too')
}

// --- rendering modes -------------------------------------------------------

console.log('rendering modes')
{
  const { exports, claim } = mount()
  const { settingsStore } = exports.__testing
  const props = assistantProps([{ kind: 'text', text: '# Title\n\nHello **world**' }])

  settingsStore.patch({ mode: 'plain' })
  const plain = renderClaim(claim, props)
  assert.ok(plain.includes('data-mdv-mode="plain"'), 'plain mode tags the wrapper')
  assert.ok(plain.includes('mdv-plain'), 'plain mode renders plain paragraphs')
  assert.ok(!plain.includes('stub-builtin'), 'plain mode replaces the built-in renderer')
  assert.ok(plain.includes('Title'), 'plain mode keeps the text')
  check('plain mode drops markup and replaces the built-in')

  settingsStore.patch({ mode: 'raw' })
  const raw = renderClaim(claim, props)
  assert.ok(raw.includes('data-mdv-mode="raw"'), 'raw mode tags the wrapper')
  assert.ok(raw.includes('mdv-raw'), 'raw mode renders a source block')
  assert.ok(raw.includes('# Title'), 'raw mode keeps the Markdown source')
  check('raw mode shows the Markdown source')

  settingsStore.patch({ mode: 'standard', toc: true })
  const toced = renderClaim(
    claim,
    assistantProps([{ kind: 'text', text: '# One\n\ntext\n\n## Two\n\nmore\n\n### Three\n' }]),
  )
  assert.ok(toced.includes('stub-builtin'), 'standard mode forwards the built-in')
  assert.ok(toced.includes('mdv-toc'), 'two or more headings produce a table of contents')
  assert.ok(toced.includes('#mdv-h-0') && toced.includes('#mdv-h-2'), 'links address every heading')
  check('standard mode keeps the built-in and prepends a ToC')

  const single = renderClaim(claim, assistantProps([{ kind: 'text', text: '# Only\n\ntext\n' }]))
  assert.ok(!single.includes('mdv-toc'), 'a lone heading produces no table of contents')
  check('the ToC needs at least two headings')

  settingsStore.patch({ toc: false, fontSize: 'compact' })
  const sized = renderClaim(claim, props)
  assert.ok(sized.includes('data-mdv-font="compact"'), 'layout preferences reach the wrapper')
  check('layout preferences are published as wrapper attributes')
}

// --- settings page ---------------------------------------------------------

console.log('settings page')
{
  const { exports, section } = mount()
  const markup = render(section.component, { close() {} })
  const switches = markup.match(/role="switch"/g) ?? []
  const segments = markup.match(/mdv-segment"/g) ?? []
  const selects = markup.match(/mdv-select"/g) ?? []
  assert.equal(switches.length, 7, 'one switch per boolean preference')
  assert.equal(segments.length, 3, 'three rendering modes are offered')
  assert.equal(selects.length, 3, 'scope, width and scale use selects')
  assert.ok(markup.includes('aria-checked="true"'), 'the master switch starts on')
  assert.ok(!markup.includes('disabled=""'), 'controls start enabled')
  check('renders seven switches, three modes and three selects')

  exports.__testing.settingsStore.patch({ enabled: false })
  const disabledMarkup = render(section.component, { close() {} })
  assert.ok(disabledMarkup.includes('disabled=""'), 'the scope select greys out with the master switch')
  check('the scope select is gated by the master switch')
}

// --- persistence -----------------------------------------------------------

console.log('persistence')
{
  const { exports, storage } = mount()
  exports.__testing.settingsStore.patch({ mode: 'raw', emoji: true })
  const written = JSON.parse(storage.get(STORAGE_KEY))
  assert.equal(written.mode, 'raw', 'writes are persisted')
  assert.equal(written.emoji, true)
  check('a change is written to localStorage')

  const reloaded = mount(written)
  assert.equal(reloaded.exports.__testing.settingsStore.getSnapshot().mode, 'raw', 'stored values are re-read')
  check('a stored value survives a reload')

  const corrupt = mount()
  corrupt.storage.set(STORAGE_KEY, '{not json')
  check('corrupt storage is tolerated at read time')
}

// --- pure helpers ----------------------------------------------------------

console.log('pure helpers')
{
  const { exports } = mount()
  const { extractHeadings, replaceShortcodes, isActive, isChatActive, isSidebarActive, settingsStore } = exports.__testing

  assert.deepEqual(
    extractHeadings(['# A\n\ntext\n\n## B\n']).map((h) => [h.level, h.text, h.index]),
    [[1, 'A', 0], [2, 'B', 1]],
  )
  check('headings carry level, text and document index')

  assert.deepEqual(
    extractHeadings(['```sh\n# not a heading\n```\n\n# Real\n']).map((h) => h.text),
    ['Real'],
  )
  check('fenced code is not scanned for headings')

  assert.deepEqual(
    extractHeadings(['## **Bold** and `code` and [link](http://x)']).map((h) => h.text),
    ['Bold and code and link'],
  )
  check('inline markup is stripped from heading text')

  assert.equal(replaceShortcodes('hi :smile: :not_a_code:'), 'hi 😄 :not_a_code:')
  check('known shortcodes convert and unknown ones are left alone')

  settingsStore.reset()
  assert.equal(isActive(settingsStore.getSnapshot()), false, 'defaults are inert')
  assert.equal(isActive({ ...settingsStore.getSnapshot(), mode: 'plain' }), true)
  assert.equal(isActive({ ...settingsStore.getSnapshot(), emoji: true }), true)
  assert.equal(isActive({ ...settingsStore.getSnapshot(), singleTildeLiteral: true }), true, 'the tilde fix counts as work')
  assert.equal(isActive({ ...settingsStore.getSnapshot(), enabled: false, mode: 'raw' }), false)
  check('isActive gates on the master switch and on real work')

  const base = { ...settingsStore.getSnapshot(), mode: 'plain' }
  assert.equal(isChatActive({ ...base, scope: 'chat' }), true)
  assert.equal(isChatActive({ ...base, scope: 'sidebar' }), false)
  assert.equal(isChatActive({ ...base, scope: 'both' }), true)
  assert.equal(isSidebarActive({ ...base, scope: 'chat' }), false)
  assert.equal(isSidebarActive({ ...base, scope: 'sidebar' }), true)
  assert.equal(isSidebarActive({ ...base, scope: 'both' }), true)
  assert.equal(isChatActive({ ...base, scope: 'both', enabled: false }), false)
  check('isChatActive / isSidebarActive split by scope and the master switch')

  const fake = (url) => ({ getAttribute: () => url })
  const ascii = exports.__testing.resourceIdentity(fake('dsh-resource://file/session/session-abc/dsh-markdown-viewer/README.md'))
  assert.deepEqual(ascii, { sessionId: 'session-abc', path: 'dsh-markdown-viewer/README.md' })
  const encoded = exports.__testing.resourceIdentity(fake('dsh-resource://file/session/session-abc/_docs/20261013%E3%80%90%E9%85%92%E9%92%A2%E3%80%91x.md'))
  assert.deepEqual(encoded, { sessionId: 'session-abc', path: '_docs/20261013【酒钢】x.md' }, 'percent-encoded file names decode before the read call')
  assert.equal(exports.__testing.resourceIdentity(fake('dsh-resource://file/workspace/ws-1/a.md')), undefined)
  check('resourceIdentity parses and decodes the preview resource url')

  const { matchSourceSpan, resolveDelMarker } = exports.__testing

  // verbatim span location
  const src1 = '前言 ~被误删~ 的内容'
  assert.deepEqual(matchSourceSpan(src1, 0, '被误删'), [4, 7])
  assert.equal(resolveDelMarker(src1, 4, 7), 'restore', 'one tilde each side restores')
  check('locates a plain strike span and marks it for restore')

  // double tilde stays
  const src2 = '双波浪号 ~~正常删除~~ 的内容'
  assert.deepEqual(matchSourceSpan(src2, 0, '正常删除'), [7, 11])
  assert.equal(resolveDelMarker(src2, 7, 11), 'keep', 'two tildes each side keeps the strike')
  check('a ~~ strike is marked keep')

  // incoherent surroundings skip
  assert.equal(resolveDelMarker('a ~x~ y ~~z~~ w', 3, 4), 'restore')
  assert.equal(resolveDelMarker('~~x', 2, 3), 'skip', 'a lone closer run is not a pair')
  check('incoherent tilde runs are skipped, not restored')

  // markup consumed by rendering is skipped while locating: the log-report
  // case, where a range tilde opened a strike whose body holds nested bold
  const src3 = '存在 27.7%~35.3% 的 0.2s 内快速返回，说明**该优化（快照缓存）确实已经生效**，平均耗时下降约 2.5~2.9 倍。'
  const content3 = '35.3% 的 0.2s 内快速返回，说明该优化（快照缓存）确实已经生效，平均耗时下降约 2.5'
  const span3 = matchSourceSpan(src3, 0, content3)
  assert.equal(span3 !== undefined, true, 'the flattened strike body is located through its bold markers')
  if (span3 !== undefined) {
    assert.equal(src3.slice(span3[0] - 1, span3[0]), '~', 'the located span starts right after its opener')
    assert.equal(resolveDelMarker(src3, span3[0], span3[1]), 'restore', 'nested bold restores')
  }
  check('locates spans with nested markup and still restores')

  // occurrence retry past an earlier identical prefix
  const src4 = '前面 x x 结论 ~x~ 结尾'
  assert.deepEqual(matchSourceSpan(src4, 0, 'x'), [3, 4])
  assert.deepEqual(matchSourceSpan(src4, 4, 'x'), [5, 6])
  assert.deepEqual(matchSourceSpan(src4, 6, 'x'), [11, 12], 'search resumes after the previous match')
  check('span search is monotonic through repeated content')
}

console.log(`\n${passed} checks passed`)
