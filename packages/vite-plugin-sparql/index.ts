import type { Plugin } from 'vite'
import { compile } from 'sparqlc'

export default <Plugin>{
  name: 'vite-plugin-sparql',
  transform(code, id) {
    if (id.endsWith('.rq')) {
      const compiled = compile(code)
      return compiled.code
    }

    return code
  },
}
