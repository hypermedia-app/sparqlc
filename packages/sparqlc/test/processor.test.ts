import $rdf from '@zazuko/env'
import { Parser, Generator } from 'sparqljs'
import { expect } from 'chai'
import type { Term } from '@rdfjs/types'
import snapshots from 'mocha-chai-rdf/snapshots.js'
import * as chai from 'chai'
import matchers from 'mocha-chai-rdf/matchers.js'
import Processor from '../processor.js'

await snapshots(chai.use(matchers), chai.util)

describe('Processor', function () {
  const parser = new Parser()
  const generator = new Generator()

  it('injects values in root where when parameter is used at root', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        BIND(sparqlc:param("foo") AS ?foo)
        ?foo ?p ?o .
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('foo'), $rdf.literal('fooVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside GRAPH pattern when parameter is used inside GRAPH', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        GRAPH <http://example.org/g> {
          BIND(sparqlc:param("var") AS ?var)
          ?s ?p ?var .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('var'), $rdf.literal('varVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values into inner GRAPH pattern when param is defined outside and used in GRAPH', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        BIND(sparqlc:param("root") AS ?root)
        GRAPH <http://example.org/g> {
          BIND(sparqlc:param("graph") AS ?graph)
          ?root ?p ?graph .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('root'), $rdf.literal('rootVal')],
      [$rdf.literal('graph'), $rdf.literal('graphVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values both at root and inside GRAPH when variable is used at root and inside GRAPH', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        BIND(sparqlc:param("root") AS ?root)
        ?root ?p1 ?o1 .
        GRAPH <http://example.org/g> {
          BIND(sparqlc:param("graph") AS ?graph)
          ?root ?p2 ?graph .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('root'), $rdf.literal('rootVal')],
      [$rdf.literal('graph'), $rdf.literal('graphVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside OPTIONAL pattern', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        ?s ?p ?o .
        OPTIONAL {
          BIND(sparqlc:param("opt") AS ?opt)
          ?s <http://example.org/prop> ?opt .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('opt'), $rdf.literal('optVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside SERVICE pattern', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        SERVICE <http://example.org/sparql> {
          BIND(sparqlc:param("serviceParam") AS ?var)
          ?s ?p ?var .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('serviceParam'), $rdf.literal('serviceVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside MINUS pattern', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        ?s ?p ?o .
        MINUS {
          BIND(sparqlc:param("minusParam") AS ?var)
          ?s ?p ?var .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('minusParam'), $rdf.literal('minusVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside UNION branches', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        {
          BIND(sparqlc:param("u1") AS ?u1)
          ?s ?p ?u1 .
        } UNION {
          BIND(sparqlc:param("u2") AS ?u2)
          ?s ?p ?u2 .
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('u1'), $rdf.literal('val1')],
      [$rdf.literal('u2'), $rdf.literal('val2')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside single-pattern UNION branches', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        { BIND(sparqlc:param("u1") AS ?u1) }
        UNION
        { BIND(sparqlc:param("u2") AS ?u2) }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('u1'), $rdf.literal('val1')],
      [$rdf.literal('u2'), $rdf.literal('val2')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values in nested scopes (GRAPH inside OPTIONAL)', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        ?s ?p ?o .
        OPTIONAL {
          GRAPH <http://example.org/g> {
            BIND(sparqlc:param("nested") AS ?nested)
            ?s ?p ?nested .
          }
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('nested'), $rdf.literal('nestedVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('injects values inside FILTER in GRAPH', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        GRAPH <http://example.org/g> {
          ?s ?p ?val .
          FILTER(?val = sparqlc:param("expected"))
        }
      }
    `)
    const params = $rdf.termMap([
      [$rdf.literal('expected'), $rdf.literal('testVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('supports NamedNode parameter keys with prefix, hash, or path', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      PREFIX schema: <http://schema.org/>
      SELECT * WHERE {
        BIND(sparqlc:param(schema:name) AS ?p1)
        BIND(sparqlc:param(<http://custom.example/ns#hashParam>) AS ?p2)
        BIND(sparqlc:param(<http://custom.example/pathParam>) AS ?p3)
        ?name schema:name ?p1 .
        ?custom1 <http://custom.example/ns#hashParam> ?p2 .
        ?custom2 <http://custom.example/pathParam> ?p3 .
      }
    `)
    const params = $rdf.termMap<Term, Term>([
      [$rdf.namedNode('http://schema.org/name'), $rdf.literal('nameVal')],
      [$rdf.namedNode('http://custom.example/ns#hashParam'), $rdf.literal('hashVal')],
      [$rdf.namedNode('http://custom.example/pathParam'), $rdf.literal('pathVal')],
    ])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('preserves single-pattern union branch without parameters', function () {
    // given
    const query = parser.parse(`
      PREFIX sparqlc: <https://sparqlc.described.at/>
      SELECT * WHERE {
        { ?s ?p ?o }
        UNION
        { ?a ?b ?c }
      }
    `)
    const params = $rdf.termMap([])
    const processor = new Processor($rdf, params)

    // when
    const processed = processor.process(query)
    const result = generator.stringify(processed)

    // then
    expect(result).toMatchSnapshot()
  })

  it('throws error when parameter is unsupported term type', function () {
    // given
    const blank = $rdf.blankNode('b1')
    const params = $rdf.termMap([
      [$rdf.literal('foo'), $rdf.literal('fooVal')],
    ])
    const processor = new Processor($rdf, params)

    // when / then
    expect(() => (processor as unknown as { paramVariable(t: Term): unknown }).paramVariable(blank)).to.throw('Only NamedNodes and Literals are supported as parameters')
  })

  it('clone creates new Processor with preserved configuration', function () {
    // given
    const params = $rdf.termMap([
      [$rdf.literal('foo'), $rdf.literal('fooVal')],
    ])
    const processor = new Processor($rdf, params)
    processor.parameters.add($rdf.literal('foo'))
    processor.variables.add('foo')

    // when
    const clone = processor.clone()

    // then
    expect([...clone.parameters].map(p => p.value)).to.deep.eq(['foo'])
    expect([...clone.variables]).to.deep.eq(['foo'])
  })
})
