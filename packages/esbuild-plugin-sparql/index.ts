import { readFile } from 'node:fs/promises'
import type { Plugin } from 'esbuild'
import { compile } from 'sparqlc'

const sparqlPlugin: Plugin = {
  name: 'sparql-loader',
  setup(build) {
    build.onLoad({ filter: /\.rq$/ }, async (args) => {
      const contents = await readFile(args.path, 'utf8')
      const compiled = compile(contents)
      compiled.writeTypes(args.path)

      return {
        contents: `export default ${compiled.code}`,
        loader: 'js',
      }
    })
  },
}

export default sparqlPlugin
