import type { LoadHook } from 'node:module'
import { fileURLToPath } from 'node:url'
import { compile } from 'sparqlc'

export const load: LoadHook = async (url, context, nextLoad) => {
  if (url.endsWith('rq')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' })
    const compiled = compile(source!.toString())
    compiled.writeTypes(fileURLToPath(url))

    return {
      format: 'module',
      source: 'export default ' + compiled.code,
    }
  }

  if (url.endsWith('inline')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' })
    return {
      format: 'module',
      source: `export default \`${source!.toString()}\`;`,
    }
  }

  return nextLoad(url, context)
}
