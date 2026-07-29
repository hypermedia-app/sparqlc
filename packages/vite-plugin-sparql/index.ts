import type { Plugin } from 'vite'
import { compile } from 'sparqlc'

export default <Plugin>{
  name: 'vite-plugin-sparql',
  enforce: 'pre',
  transform(code, id) {
    // Vite passes the full id including query (e.g., /abs/path.q.rq?import&base=...)
    const url = new URL(id, 'file://')
    const pathname = url.pathname

    if (/\.r[qu]$/.test(pathname)) {
      const base = url.searchParams.get('base') ?? undefined
      const compiled = compile(code, { base: base ?? undefined })
      return { code: compiled.code, map: null }
    }

    return null
  },
}
