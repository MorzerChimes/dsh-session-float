/**
 * Build the browser half into lib/client.js in the DSH client-module format:
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...cjs...; return module.exports } })
 *
 * Everything in the Web shell's shared module table stays external so the
 * plugin uses the page's React and Cordis instances. Motion is bundled.
 * CSS modules are scoped (sf_<name>) and injected inside the factory so the
 * module system can reclaim the <style> tag when the plugin is disabled.
 */
import { build } from 'esbuild'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const ID = pkg.name

/** Keys of PLATFORM_MODULES in dsh-web-frontend (react 18.3.1). */
const SHARED = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const cssModules = {
  name: 'scoped-css-modules',
  setup(b) {
    b.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8')
      const names = new Set()
      const scoped = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^\w-])\.([a-zA-Z_][\w-]*)/g, (match, pre, name) => {
          names.add(name)
          return `${pre}.sf_${name}`
        })
        .replace(/@keyframes\s+([\w-]+)/g, '@keyframes sf_$1')
        .replace(/animation:\s*([\w-]+)/g, 'animation: sf_$1')
        .replace(/\s+/g, ' ')
        .trim()
      const map = Object.fromEntries([...names].map((n) => [n, `sf_${n}`]))
      const tag = `${ID}/${args.path.split('/').pop()}`
      const contents = `
const css = ${JSON.stringify(scoped)};
const tagId = ${JSON.stringify(tag)};
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
  const el = document.createElement('style');
  el.dataset.plugin = ${JSON.stringify(ID)};
  el.dataset.pluginCss = tagId;
  el.textContent = css;
  document.head.appendChild(el);
}
export default ${JSON.stringify(map)};
`
      return { contents, loader: 'js' }
    })
  },
}

/**
 * framer-motion probes `require("@emotion/is-prop-valid")` inside try/catch;
 * the DSH module require throws for unknown ids and the catch keeps the
 * built-in prop filter. That probe is the only tolerated non-shared request.
 */
const TOLERATED = ['@emotion/is-prop-valid']
/** Replace the probe with a throw so no loader ever sees the request. */
const stripProbe = (code) => code.replaceAll('require("@emotion/is-prop-valid")', '(() => { throw new Error("optional") })()')

const watch = process.argv.includes('--watch')

const result = await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: SHARED,
  plugins: [cssModules],
  minify: !process.argv.includes('--no-minify'),
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  write: false,
  logLevel: 'warning',
})

const code = stripProbe(result.outputFiles[0].text)
const required = new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
const unexpected = [...required].filter((r) => !SHARED.includes(r) && !TOLERATED.includes(r))
if (unexpected.length > 0) {
  throw new Error(`bundle requires modules outside the shared table: ${unexpected.join(', ')}`)
}

const wrapped = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${code}
\t\treturn module.exports;
\t}
});
`
const out = join(root, 'lib/client.js')
await writeFile(out, wrapped)

const { size } = await stat(out)
const inputs = Object.entries(result.metafile.outputs)[0]?.[1].inputs ?? {}
const byPkg = {}
for (const [file, info] of Object.entries(inputs)) {
  const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
  const key = m ? m[1] : 'src'
  byPkg[key] = (byPkg[key] ?? 0) + info.bytesInOutput
}
console.log(`lib/client.js ${(size / 1024).toFixed(1)} KiB; requires: ${[...required].join(', ')}`)
for (const [k, v] of Object.entries(byPkg).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${(v / 1024).toFixed(1)} KiB`)
if (watch) console.log('watch mode is not supported; rerun the build')
