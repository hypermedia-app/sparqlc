import sparqljs, {Parser} from "sparqljs";
import type {Stream, Term} from "@rdfjs/types";
import {StreamClient} from "sparql-http-client";
import { Environment } from "@rdfjs/environment/Environment.js";
import {DataFactory} from "@rdfjs/types";

export type Params = URLSearchParams | Map<Term, Term> | Record<string, Term>;

export type Env = Environment<DataFactory>

export interface QueryExecutor<T extends boolean | void | Stream = boolean | void | Stream> {
    (...params: [...Params[], StreamClient, Env]): Promise<T>
}

export function compile(query: string) {
    const parser = new Parser()
    const queryObject = parser.parse(query)

    const execute: QueryExecutor = async function (...args) {
        const {isClient, isEnv, toTermMap} = await import('sparqlc/runtime.js')
        const TermMap = (await import('@rdfjs/term-map')).default

        const env = args.pop()
        if(!isEnv(env)) {
            throw new Error('Last argument must be an Env instance')
        }

        const client = args.pop()
        if (!isClient(client)) {
            throw new Error('Second last argument must be a SparqlClient instance')
        }
        const params = (args as Params[]).reduce(toTermMap, new TermMap())
        const query = queryObject

        const {default: Processor} = await import('@hydrofoil/sparql-processor')

        const processor = new (class extends Processor {
            override processTriple(triple: sparqljs.Triple) {
                if ('termType' in triple.predicate && triple.predicate.value === 'https://sparqlc.described.at/param') {
                    const paramName = triple.object
                    const varName = triple.subject.value
                    const expression = params.get(paramName)

                    if(!expression) {
                        throw new Error(`No value provided for parameter ${paramName.value}`)
                    }

                    return <sparqljs.BindPattern>{
                        type: 'bind',
                        variable: this.factory.variable!(varName),
                        expression,
                    }
                }

                return triple
            }
        })(env)

        const {Generator} = await import('sparqljs')

        const processed = processor.process(query)
        if (query.type !== 'query') {
            throw new Error('Only queries are supported')
        }

        let method = query.queryType.toLowerCase() as keyof StreamClient['query'] | 'describe'
        if (method === 'describe') {
            method = 'construct'
        }

        const queryString = new Generator().stringify(processed)
        return client.query[method](queryString)
    }

    return execute.toString().replace('queryObject', JSON.stringify(queryObject))
}
