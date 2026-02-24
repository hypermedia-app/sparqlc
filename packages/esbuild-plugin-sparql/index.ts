import { readFile } from 'node:fs/promises'
import type { Plugin } from 'esbuild'
import { compile } from 'sparqlc'

const sparqlPlugin: Plugin = {
  name: 'sparql-loader',
  setup(build) {
    build.onLoad({ filter: /\.rq$/ }, async (args) => {
      const contents = await readFile(args.path, 'utf8')
      const compiled = compile(contents)

      return {
        contents: compiled.code,
        loader: 'ts',
      }
    })
  },
}

export default sparqlPlugin
