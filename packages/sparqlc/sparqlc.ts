import fs from 'node:fs'
import { Parser, Wildcard } from 'sparqljs'
import type { DatasetCore, Stream, Term, NamedNode, Variable } from '@rdfjs/types'
import type { Expression, Ordering } from 'sparqljs'
import type { Client } from 'sparql-http-client'
import type { StreamClient } from 'sparql-http-client/StreamClient.js'
import rdf from '@zazuko/env'
import type { Processor } from '@hydrofoil/sparql-processor'
import type { Env } from './QueryAnalyzer.js'
import QueryAnalyzer from './QueryAnalyzer.js'

export type { Env } from './QueryAnalyzer.js'

export type Params = URLSearchParams | Map<Term, Term | Term[]> | Record<string, Term>

export interface FromOptions {
  default?: Term | string | Array<Term | string> | null
  named?: Term | string | Array<Term | string> | null
}

export type OrderDirection = 'ASC' | 'DESC' | 'asc' | 'desc'

export type OrderTuple<TVar extends string = string>
  = | [TVar | Variable, OrderDirection]
    | readonly [TVar | Variable, OrderDirection]

export type OrderItem<TVar extends string = string>
  = | TVar
    | Variable
    | OrderTuple<TVar>
    | Ordering
    | { expression: TVar | Variable | Expression, descending?: boolean }

export type OrderBy<TVar extends string = string>
  = | OrderItem<TVar>
    | OrderItem<TVar>[]
    | readonly OrderItem<TVar>[]

export interface QueryModifiers<TVar extends string = string> {
  base?: string | NamedNode | null
  distinct?: boolean | null
  from?: Term | string | Array<Term | string> | FromOptions | null
  fromNamed?: Term | string | Array<Term | string> | null
  limit?: number | null
  offset?: number | null
  orderBy?: OrderBy<TVar> | null
}

export interface Options<C extends Client | undefined = Client, TVar extends string = string> extends QueryModifiers<TVar> {
  env: Env
  client?: C
  processors?: Processor[]
}

export interface ExecuteSelect<
  Bindings extends Record<string, Term> = Record<string, Term>,
  TVar extends string = keyof Bindings & string,
> {
  <C extends Client | undefined = undefined>(...params: [...Params[], Options<C, TVar>]):
  C extends undefined ? Promise<string>
    : C extends StreamClient ? Promise<AsyncGenerator<Bindings>>
      : Promise<Bindings[]>
}

export interface ExecuteConstruct<TVar extends string = string> {
  <C extends Client | undefined = undefined>(...params: [...Params[], Options<C, TVar>]):
  C extends undefined ? Promise<string>
    : C extends StreamClient ? Promise<Stream>
      : Promise<DatasetCore>
}

export interface ExecuteAsk<TVar extends string = string> {
  <C extends Client | undefined = undefined>(...params: [...Params[], Options<C, TVar>]):
  C extends undefined ? Promise<string> : Promise<boolean>
}

export interface ExecuteUpdate {
  <C extends Client | undefined = undefined>(...params: [...Params[], Options<C>]):
  C extends undefined ? Promise<string> : Promise<void>
}

export type Execute = ExecuteSelect | ExecuteConstruct | ExecuteAsk | ExecuteUpdate

type Query = {
  code: string
  returnType: string
  execute: Execute
}

export function compile(query: string, { base }: QueryModifiers = {}): Query {
  const baseIRI = base ? typeof base === 'string' ? base : base.value : undefined

  const parser = new Parser({
    baseIRI,
  })
  const queryObject = parser.parse(query)

  const analyzer = new QueryAnalyzer(rdf)
  analyzer.process(queryObject)
  const { returnType } = analyzer

  const moduleTemplate = fs.readFileSync(new URL('./moduleTemplate.js', import.meta.url), 'utf-8')

  return {
    execute() {
      throw new Error('temp')
    },
    returnType,
    code: moduleTemplate.replace('queryObject', JSON.stringify(queryObject, (key, value) => {
      if (value instanceof Wildcard) {
        return <Wildcard>{
          termType: 'Wildcard',
          value: '*',
        }
      }

      return value
    })),
  }
}
