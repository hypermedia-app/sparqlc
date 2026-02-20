import * as fs from 'node:fs'
import { Parser } from 'sparqljs'
import type { Stream, Term } from '@rdfjs/types'
import type { Client, StreamClient } from 'sparql-http-client'
import rdf from '@zazuko/env'
import type Processor from '@hydrofoil/sparql-processor'
import QueryAnalyzer from './QueryAnalyzer.js'
import type { Env } from './QueryAnalyzer.js'

export type { Env } from './QueryAnalyzer.js'

export type Params = URLSearchParams | Map<Term, Term | Term[]> | Record<string, Term>;

interface ExecuteOptions<C extends Client | undefined = Client> {
  env: Env
  client?: C
  processors?: Processor[]
}

export interface QueryExecutor<T extends boolean | void | Stream | Record<string, Term>[] = boolean | void | Stream | Record<string, Term>[], C extends Client | undefined = Client> {
  (...params: [...Params[], ExecuteOptions]): C extends undefined ? Promise<string> : Promise<T>
}

interface CompileResult {
  code: string
  execute: QueryExecutor
  writeTypes(path: string): void
}

export function compile(query: string): CompileResult {
  const parser = new Parser()
  const queryObject = parser.parse(query)

  const execute: QueryExecutor = async function (...args) {
    const { isEnv, toTermMap } = await import('sparqlc/runtime.js')
    const { default: Processor } = await import('sparqlc/processor.js')
    const { default: TermMap } = await import('@rdfjs/term-map')

    const { client, env, processors = [] } = args.pop() as unknown as ExecuteOptions

    if (!isEnv(env)) {
      throw new Error('Parameters must be followed by executor options. `env` is required.')
    }

    const params = (args as Params[]).reduce((map: Map<Term, Term | Term[]>, p) => toTermMap(map, p), new TermMap())
    const query = queryObject

    const paramsProcessor = new Processor(env, params)

    const { default: sparqljs } = await import('sparqljs')
    const { Generator } = sparqljs

    const processed = [paramsProcessor, ...processors].reduce((query, processor) => processor.process(query), query)
    if (query.type !== 'query') {
      throw new Error('Only queries are supported')
    }

    let method = query.queryType.toLowerCase() as keyof StreamClient['query'] | 'describe'
    if (method === 'describe') {
      method = 'construct'
    }

    const queryString = new Generator().stringify(processed)
    if (!client) {
      return queryString
    }

    return client.query[method](queryString)
  }

  const analyzer = new QueryAnalyzer(rdf)
  analyzer.process(queryObject)
  const { returnType } = analyzer

  return {
    execute,
    code: execute.toString().replace('queryObject', JSON.stringify(queryObject)),
    writeTypes(srcPath: string) {
      fs.writeFileSync(srcPath + '.d.ts', `import {QueryExecutor} from "sparqlc";
import {Stream} from "@rdfjs/types";
export type ResultType = ${returnType}
declare const query: QueryExecutor<ResultType>
export default query
`)
    },
  }
}
