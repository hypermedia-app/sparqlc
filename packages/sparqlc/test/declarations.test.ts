import { expect } from 'chai'
import type { Query } from '../sparqlc.js'
import { toDeclaration } from '../declarations.js'

describe('toDeclaration', function () {
  it('generates declaration for SELECT query with Bindings export', function () {
    const query = 'SELECT ?foo ?bar WHERE { ?foo ?p ?bar }'
    const result = toDeclaration(query)

    expect(result).to.include('import type * as sparqlc from "sparqlc"')
    expect(result).to.include('import type { Term } from "@rdfjs/types"')
    expect(result).to.include("export type Bindings = sparqlc.ExecuteSelect<Record<'foo' | 'bar', Term>, 'bar' | 'foo' | 'p'> extends sparqlc.ExecuteSelect<infer B> ? B : never")
    expect(result).to.include("declare const _default: sparqlc.ExecuteSelect<Record<'foo' | 'bar', Term>, 'bar' | 'foo' | 'p'>")
    expect(result).to.include('export default _default')
  })

  it('generates declaration for CONSTRUCT query', function () {
    const query = 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'
    const result = toDeclaration(query)

    expect(result).to.include('import type * as sparqlc from "sparqlc"')
    expect(result).to.include('import type { Term } from "@rdfjs/types"')
    expect(result).to.not.include('export type Bindings')
    expect(result).to.include('declare const _default: sparqlc.ExecuteConstruct')
    expect(result).to.include('export default _default')
  })

  it('generates declaration for DESCRIBE query', function () {
    const query = 'DESCRIBE <http://example.org/resource>'
    const result = toDeclaration(query)

    expect(result).to.include('import type * as sparqlc from "sparqlc"')
    expect(result).to.include('declare const _default: sparqlc.ExecuteConstruct')
    expect(result).to.include('export default _default')
  })

  it('generates declaration for ASK query', function () {
    const query = 'ASK { ?s ?p ?o }'
    const result = toDeclaration(query)

    expect(result).to.include('import type * as sparqlc from "sparqlc"')
    expect(result).to.include('declare const _default: sparqlc.ExecuteAsk')
    expect(result).to.include('export default _default')
  })

  it('generates declaration for UPDATE operation', function () {
    const query = 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }'
    const result = toDeclaration(query)

    expect(result).to.include('import type * as sparqlc from "sparqlc"')
    expect(result).to.include('declare const _default: sparqlc.ExecuteUpdate')
    expect(result).to.include('export default _default')
  })

  it('generates unknown declaration for unknown return type', function () {
    const customCompile = (): Query => ({
      returnType: 'unknown',
      code: '',
      execute: () => { throw new Error() },
    })
    const result = toDeclaration('SELECT * WHERE { ?s ?p ?o }', { compile: customCompile })
    expect(result).to.eq('declare const _default: unknown\nexport default _default\n')
  })

  it('throws for invalid query syntax', function () {
    expect(() => toDeclaration('INVALID QUERY')).to.throw()
  })

  it('handles queries with relative IRIs using default base', function () {
    const result = toDeclaration('SELECT * WHERE { <relative-path> ?p ?o }')
    expect(result).to.include('declare const _default: sparqlc.ExecuteSelect')
  })
})
