import {Parser, Query} from "sparqljs";
import type {Stream, Term} from "@rdfjs/types";
import {Client, StreamClient} from "sparql-http-client";
import { Environment } from "@rdfjs/environment/Environment.js";
import {DataFactory, Literal} from "@rdfjs/types";

export type Params = URLSearchParams | Map<Literal, Term> | Record<string, Term>;

export type Env = Environment<DataFactory>

export interface QueryExecutor<T extends boolean | void | Stream = boolean | void | Stream, C extends Client | undefined = Client> {
    (...params: [...Params[], Env] | [...Params[], Env, C]): C extends undefined ? Promise<string> : Promise<T>
}

interface CompileResult {
    code: string
    execute: QueryExecutor
    queryType: Query['queryType'] | 'UPDATE'
}

export function compile(query: string): CompileResult {
    const parser = new Parser()
    const queryObject = parser.parse(query)

    const execute: QueryExecutor = async function (...args) {
        const {isClient, isEnv, toTermMap} = await import('sparqlc/runtime.js')
        const { createProcessor } = await import('sparqlc/processor.js')

        let client: Client | undefined
        let env: Env | undefined

        const lastArg = args[args.length - 1]
        const secondLastArg = args[args.length - 2]

        if (isClient(lastArg)) {
            client = lastArg
            env = secondLastArg as Env
            args.splice(-2)
        } else if (isEnv(lastArg)) {
            env = lastArg
            args.splice(-1)
        }

        if (!isEnv(env)) {
            throw new Error('Parameters must be followed by an instance of RDF/JS environment')
        }

        const params = (args as Params[]).reduce((map: Map<string, Term>, p) => toTermMap(map, p), new Map())
        const query = queryObject

        const processor = await createProcessor(env, params)

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
        if(!client) {
            return queryString
        }

        return client.query[method](queryString)
    }

    const queryType = queryObject.type === 'query'
        ? queryObject.queryType
        : 'UPDATE'

    return {
        queryType,
        execute,
        code: execute.toString().replace('queryObject', JSON.stringify(queryObject))
    }
}
