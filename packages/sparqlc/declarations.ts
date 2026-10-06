import type { NamedNode } from '@rdfjs/types'
import * as sparqlc from './sparqlc.js'

export interface DeclarationOptions {
  base?: string | NamedNode | null
  compile?: typeof sparqlc.compile
}

export function toDeclaration(source: string, options: DeclarationOptions = { base: 'http://example.org/' }): string {
  const base = options?.base ?? 'http://example.org/'
  const compileFn = options?.compile ?? sparqlc.compile
  const compiled = compileFn(source, { base })

  if (compiled.returnType === 'unknown') {
    return 'declare const _default: unknown\nexport default _default\n'
  }

  const queryType = `sparqlc.Execute${compiled.returnType}`
  const bindingsType = queryType.startsWith('sparqlc.ExecuteSelect')
    ? `export type Bindings = ${queryType} extends sparqlc.ExecuteSelect<infer B> ? B : never\n`
    : ''

  return `import type * as sparqlc from "sparqlc"
import type { Term } from "@rdfjs/types"
${bindingsType}declare const _default: ${queryType}
export default _default
`
}
