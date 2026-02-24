import type { LoadHook, ResolveHook } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import { compile } from 'sparqlc'

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (specifier.endsWith('.rq.js')) {
    const rqSpecifier = specifier.replace(/\.js$/, '')
    try {
      return await nextResolve(rqSpecifier, context)
    } catch {
      // ignore
    }
  }

  return nextResolve(specifier, context)
}

export const load: LoadHook = async (url, context, nextLoad) => {
  if (url.endsWith('.rq') || url.endsWith('.rq.js')) {
    const rqUrl = url.endsWith('.js') ? url.replace(/\.js$/, '') : url
    let source
    try {
      source = fs.readFileSync(fileURLToPath(rqUrl), 'utf8')
    } catch {
      const result = await nextLoad(rqUrl, { ...context, format: 'module' })
      source = result.source
    }
    const compiled = compile(source!.toString())

    return {
      format: 'module',
      source: `export default ${compiled.code}`,
      shortCircuit: true,
    }
  }

  if (url.endsWith('inline')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' })
    return {
      format: 'module',
      source: `export default \`${source!.toString()}\`;`,
      shortCircuit: true,
    }
  }

  return nextLoad(url, context)
}
