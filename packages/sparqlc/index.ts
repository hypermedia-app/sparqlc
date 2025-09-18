import sparqljs, {Parser} from "sparqljs";
import SparqlClient from "sparql-http-client/ParsingClient.js";

export function compile(query: string) {
    const parser = new Parser()
    const queryObject = parser.parse(query)

    async function execute(client: SparqlClient, params: URLSearchParams) {
        const query = queryObject

        const {default: Processor} = await import('@hydrofoil/sparql-processor')
        const {default: $rdf} = await import ('@zazuko/env/web.js')

        const processor = new (class extends Processor {
            override processTriple(triple: sparqljs.Triple) {
                if ('termType' in triple.predicate && triple.predicate.value === 'https://sparqlc.described.at/param') {
                    const paramName = triple.object.value
                    const varName = triple.subject.value

                    return <sparqljs.BindPattern>{
                        type: 'bind',
                        variable: $rdf.variable(varName),
                        expression: $rdf.literal(params.get(paramName)),
                    }
                }

                return triple
            }
        })($rdf)

        const {Generator} = await import('sparqljs')

        const processed = processor.process(query)
        if (query.type !== 'query') {
            throw new Error('Only queries are supported')
        }

        let method = query.queryType.toLowerCase()
        if (method === 'describe') {
            method = 'construct'
        }

        return client.query[method](new Generator().stringify(processed))
    }

    return execute.toString().replace('queryObject', JSON.stringify(queryObject))
}
