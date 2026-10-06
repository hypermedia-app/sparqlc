import type { LoadHook, LoadHookSync, ModuleSource, ResolveHook, ResolveHookSync } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import { compile } from 'sparqlc'

const extensionPattern = /\.r[qu](\.js)?$/

function attachBaseAttribute(url: string, base?: string) {
  const specifierWithAttribs = new URL(url)
  if (base) {
    specifierWithAttribs.searchParams.set('base', base)
  }
  return specifierWithAttribs.toString()
}

function compileSparql(url: URL, source: ModuleSource) {
  const compiled = compile(source.toString(), {
    base: url.searchParams.get('base'),
  })
  return {
    format: 'module' as const,
    source: compiled.code,
    shortCircuit: true,
  }
}

function compileInline(source: ModuleSource) {
  return {
    format: 'module' as const,
    source: `export default \`${source.toString()}\`;`,
    shortCircuit: true,
  }
}

function readSparqlSource(url: URL): string | undefined {
  try {
    return fs.readFileSync(fileURLToPath(url), 'utf8')
  }
  catch {
    return undefined
  }
}

// Async hooks for Node module.register() worker thread
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (extensionPattern.test(specifier)) {
    const querySpecifier = specifier.replace(/\.js$/, '')
    const resolved = await nextResolve(querySpecifier, context)
    return {
      url: attachBaseAttribute(resolved.url, context.importAttributes?.base),
      shortCircuit: true,
    }
  }

  return nextResolve(specifier, context)
}

export const load: LoadHook = async (url, context, nextLoad) => {
  const resolved = new URL(url)

  if (extensionPattern.test(resolved.pathname)) {
    const fileSource = readSparqlSource(resolved)
    const source = fileSource ?? (await nextLoad(resolved.href, { ...context, format: 'module' })).source
    return compileSparql(resolved, source!)
  }

  if (url.endsWith('inline')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' })
    return compileInline(source!)
  }

  return nextLoad(url, context)
}

// Synchronous hooks for Node module.registerHooks() in-thread
export const resolveSync: ResolveHookSync = (specifier, context, nextResolve) => {
  if (extensionPattern.test(specifier)) {
    const querySpecifier = specifier.replace(/\.js$/, '')
    const resolved = nextResolve(querySpecifier, context)
    return {
      url: attachBaseAttribute(resolved.url, context.importAttributes?.base),
      shortCircuit: true,
    }
  }

  return nextResolve(specifier, context)
}

export const loadSync: LoadHookSync = (url, context, nextLoad) => {
  const resolved = new URL(url)

  if (extensionPattern.test(resolved.pathname)) {
    const fileSource = readSparqlSource(resolved)
    const source = fileSource ?? nextLoad(resolved.href, { ...context, format: 'module' }).source
    return compileSparql(resolved, source!)
  }

  if (url.endsWith('inline')) {
    const { source } = nextLoad(url, { ...context, format: 'module' })
    return compileInline(source!)
  }

  return nextLoad(url, context)
}
