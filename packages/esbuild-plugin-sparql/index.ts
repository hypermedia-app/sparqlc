import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'esbuild'
import { compile } from 'sparqlc'

const sparqlPlugin: Plugin = {
  name: 'sparql-loader',
  setup(build) {
    // Capture .rq and .ru, preserving optional query like ?base=...
    build.onResolve({ filter: /\.r[qu](\?.*)?$/ }, async (args) => {
      const [p, query] = args.path.split('?')
      const absPath = path.isAbsolute(p) ? p : path.join(args.resolveDir, p)

      return {
        path: query ? `${absPath}?${query}` : absPath,
        namespace: 'sparql',
      }
    })

    build.onLoad({ filter: /.*/, namespace: 'sparql' }, async (args) => {
      const [absPath, query] = args.path.split('?')
      const contents = await readFile(absPath, 'utf8')
      const params = new URLSearchParams(query ?? '')
      const base = params.get('base') ?? undefined
      const compiled = compile(contents, { base })

      return {
        contents: compiled.code,
        loader: 'ts',
        resolveDir: path.dirname(absPath),
      }
    })
  },
}

export default sparqlPlugin
