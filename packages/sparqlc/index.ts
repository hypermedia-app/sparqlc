import { Parser } from 'sparqljs'
import type { DatasetCore, Stream, Term } from '@rdfjs/types'
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

export interface ExecuteSelect<Bindings extends Record<string, Term> = Record<string, Term>> {
  <C extends Client | undefined = undefined>(...params: [...Params[], ExecuteOptions<C>]):
  C extends undefined ? Promise<string>
    : C extends StreamClient ? Promise<AsyncGenerator<Bindings>>
      : Promise<Bindings[]>
}

export interface ExecuteConstruct {
  <C extends Client | undefined = undefined>(...params: [...Params[], ExecuteOptions<C>]):
  C extends undefined ? Promise<string>
    : C extends StreamClient ? Promise<Stream>
      : Promise<DatasetCore>
}

export interface ExecuteAsk {
  <C extends Client | undefined = undefined>(...params: [...Params[], ExecuteOptions<C>]):
  C extends undefined ? Promise<string> : Promise<boolean>
}

export interface ExecuteUpdate {
  <C extends Client | undefined = undefined>(...params: [...Params[], ExecuteOptions<C>]):
  C extends undefined ? Promise<string> : Promise<void>
}

type Query = {
  code: string
  returnType: string
  execute: ExecuteSelect | ExecuteConstruct | ExecuteAsk | ExecuteUpdate
}

export function compile(query: string): Query {
  const parser = new Parser()
  const queryObject = parser.parse(query)

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const execute: Query['execute'] = async function (...args) {
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
    returnType,
    code: execute.toString().replace('queryObject', JSON.stringify(queryObject)),
  }
}
