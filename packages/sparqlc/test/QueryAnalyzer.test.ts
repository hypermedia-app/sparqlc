import $rdf from '@zazuko/env'
import { Parser } from 'sparqljs'
import { expect } from 'chai'
import QueryAnalyzer from '../QueryAnalyzer.js'

describe('QueryAnalyzer', function () {
  it('select wildcard query is correctly typed with all variables', function () {
    // given
    const analyer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyer.process(parser.parse(`
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      prefix fruit: <http://example.org/fruits/>
      
      SELECT * WHERE {
        ?fruit a fruit:Fruit ; rdfs:label ?label
      }`),
    )

    // then
    expect(analyer.returnType).to.eq("Select<Record<'fruit' | 'label', Term>, 'fruit' | 'label'>")
    expect([...analyer.variables].sort()).to.deep.eq(['fruit', 'label'])
  })

  it('select with aggregations are correctly mapped to return type', function () {
    // given
    const analyer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyer.process(parser.parse(`
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      prefix fruit: <http://example.org/fruits/>
      
      SELECT ?fruit (COUNT(?label) AS ?labels) WHERE {
        ?fruit a fruit:Fruit ; rdfs:label ?label
      } GROUP by ?fruit`),
    )

    // then
    expect(analyer.returnType).to.eq("Select<Record<'fruit' | 'labels', Term>, 'fruit' | 'label' | 'labels'>")
    expect([...analyer.variables].sort()).to.deep.eq(['fruit', 'label', 'labels'])
  })

  it('bound variables are included in return type', function () {
    // given
    const analyer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyer.process(parser.parse(`
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      prefix fruit: <http://example.org/fruits/>
      
      SELECT * WHERE {
        ?fruit a fruit:Fruit .
        BIND('bar' as ?foo)
      }`),
    )

    // then
    expect(analyer.returnType).to.eq("Select<Record<'foo' | 'fruit', Term>, 'foo' | 'fruit'>")
    expect([...analyer.variables].sort()).to.deep.eq(['foo', 'fruit'])
  })

  it('select query with no variables returns never', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse('SELECT * WHERE {}'))

    // then
    expect(analyzer.returnType).to.eq('Select<Record<never, Term>, never>')
    expect([...analyzer.variables]).to.deep.eq([])
  })

  it('construct query returnType is Construct', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'))

    // then
    expect(analyzer.returnType).to.eq('Construct')
  })

  it('describe query returnType is Construct', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse('DESCRIBE <http://example.org/item>'))

    // then
    expect(analyzer.returnType).to.eq('Construct')
  })

  it('ask query returnType is Ask', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse('ASK WHERE { ?s ?p ?o }'))

    // then
    expect(analyzer.returnType).to.eq('Ask')
  })

  it('update query returnType is Update', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse('INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }'))

    // then
    expect(analyzer.returnType).to.eq('Update')
  })

  it('extracts parameters from parameter function calls', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse(`
      SELECT * WHERE {
        ?s ?p ?o .
        FILTER(?s = <https://sparqlc.described.at/param>("mySubject"))
      }
    `))

    // then
    expect([...analyzer.parameters].map(p => p.value)).to.deep.eq(['mySubject'])
  })

  it('throws when parameter function call has non-literal argument', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()
    const query = parser.parse(`
      SELECT * WHERE {
        ?s ?p ?o .
        FILTER(?s = <https://sparqlc.described.at/param>(1 + 2))
      }
    `)

    // when / then
    expect(() => analyzer.process(query)).to.throw('Expected literal value for parameter name')
  })

  it('extracts parameters from parameter triple predicates', function () {
    // given
    const analyzer = new QueryAnalyzer($rdf)
    const parser = new Parser()

    // when
    analyzer.process(parser.parse(`
      SELECT * WHERE {
        <http://example.org/item> <https://sparqlc.described.at/param> ?value .
      }
    `))

    // then
    expect([...analyzer.parameters].map(p => p.value)).to.deep.eq(['http://example.org/item'])
  })
})
