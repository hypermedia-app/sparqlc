import * as url from 'node:url'
import { build } from 'esbuild'
import { nodeExternalsPlugin } from 'esbuild-node-externals'
import sparqlPlugin from '../index.js'

await build({
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  entryPoints: ['index.ts'],
  outdir: 'out',
  absWorkingDir: url.fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    nodeExternalsPlugin(),
    sparqlPlugin,
  ],
  banner: {
    js: 'import { createRequire } from \'module\';const require = createRequire(import.meta.url);',
  },
})
