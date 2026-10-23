// Ground-truth harness: parse a markdown source with the REAL micromark+gfm
// (the same stack DSH bundles) and count <del> occurrences, then compare with
// the plugin's collectStrikes count. Usage:
//   node verify-strikes.mjs <source-file.md>
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scratchRoot = 'C:/Users/Administrator/AppData/Local/Temp/md-verify'
const req = createRequire(scratchRoot + '/package.json')
const { micromark } = req('micromark')
const { gfm, gfmHtml } = req('micromark-extension-gfm')

const sourceFile = process.argv[2]
const source = readFileSync(sourceFile, 'utf8')

// 1. ground truth: real parser
const html = micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml] })
const realDels = (html.match(/<del>/g) || []).length
console.log('micromark <del> count:', realDels)

// 2. plugin scanner (load the built bundle like the smoke test does)
const BUNDLE = readFileSync('G:/TestWorkspace/1.ExtensionsWorkspaces/deepseekharness/dsh-markdown-viewer/client.js', 'utf8')
globalThis.window = { __ModuleLoader__: { load(s) { globalThis.__spec = s } }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout, clearTimeout }
globalThis.document = { getElementById: () => null, createElement: () => ({ dataset: {}, style: {}, append() {}, setAttribute() {} }), head: { append() {} } }
new Function(BUNDLE)()
const stubs = { react: { Component: class { constructor() {} } }, 'react/jsx-runtime': {}, '@deepseek-ai/dsh-client-ui-primitives': {} }
const plugin = globalThis.__spec.factory((id) => stubs[id] || {})
const collectStrikes = plugin.__testing.collectStrikes
const strikes = collectStrikes([source])
console.log('collectStrikes count:', strikes.length)
console.log(strikes.length === realDels ? 'MATCH' : 'MISMATCH')
