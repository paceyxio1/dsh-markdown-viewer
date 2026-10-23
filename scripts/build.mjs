import { build } from 'esbuild'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packageName = 'dsh-plugin-markdown-viewer'

// --- host half -------------------------------------------------------------
// The Cordis entry is a no-op stub, but it must exist: the `insert` row in
// cordis.patch.yml resolves this file as the plugin module.
mkdirSync(join(root, 'dist'), { recursive: true })
await build({
  entryPoints: [join(root, 'src/server/index.ts')],
  outfile: join(root, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
})

// --- browser half ----------------------------------------------------------
// Modules the shell shares into its frozen module table. Everything else is
// bundled, so the artifact stays self-contained and needs no runtime install.
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const temporaryClient = join(root, '.tmp-client.js')
await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  outfile: temporaryClient,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  minify: true,
  external: CLIENT_EXTERNALS,
  sourcemap: false,
  logLevel: 'info',
})

const body = readFileSync(temporaryClient, 'utf8')
// The browser module system rejects a bundle that registers any id other than
// this package's own name, so the wrapper stamps it here.
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageName)},
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    (function (module, exports, require) {
${body}
    })(module, module.exports, require);
    return module.exports;
  }
});
`
writeFileSync(join(root, 'client.js'), wrapped)
rmSync(temporaryClient, { force: true })

console.log('[build] dist/index.js')
console.log(`[build] client.js (${(wrapped.length / 1024).toFixed(1)} KiB)`)
