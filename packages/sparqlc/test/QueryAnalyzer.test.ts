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
    expect(analyer.returnType).to.eq("Select<Record<'fruit' | 'label', Term>>")
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
    expect(analyer.returnType).to.eq("Select<Record<'fruit' | 'labels', Term>>")
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
    expect(analyer.returnType).to.eq("Select<Record<'foo' | 'fruit', Term>>")
  })
})
