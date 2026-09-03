import type { LoadHook, ResolveHook } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import { compile } from 'sparqlc'

const extensionPattern = /\.r[qu](\.js)?$/

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (extensionPattern.test(specifier)) {
    const querySpecifier = specifier.replace(/\.js$/, '')

    const resolved = await nextResolve(querySpecifier, context)
    const specifierWithAttribs = new URL(resolved.url)
    if (context.importAttributes.base) {
      specifierWithAttribs.searchParams.set('base', context.importAttributes.base)
    }

    return { url: specifierWithAttribs.toString(), shortCircuit: true }
  }

  return nextResolve(specifier, context)
}

export const load: LoadHook = async (url, context, nextLoad) => {
  const resolved = new URL(url)

  if (extensionPattern.test(resolved.pathname)) {
    let source
    try {
      source = fs.readFileSync(fileURLToPath(resolved), 'utf8')
    }
    catch {
      const result = await nextLoad(resolved.href, { ...context, format: 'module' })
      source = result.source
    }
    const compiled = compile(source!.toString(), {
      base: resolved.searchParams.get('base'),
    })

    return {
      format: 'module',
      source: compiled.code,
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
