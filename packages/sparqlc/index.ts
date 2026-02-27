import fs from 'node:fs'
import { Parser } from 'sparqljs'
import type { DatasetCore, Stream, Term } from '@rdfjs/types'
import type { Client, StreamClient } from 'sparql-http-client'
import rdf from '@zazuko/env'
import type Processor from '@hydrofoil/sparql-processor'
import type { Env } from './QueryAnalyzer.js'
import QueryAnalyzer from './QueryAnalyzer.js'

export type { Env } from './QueryAnalyzer.js'

export type Params = URLSearchParams | Map<Term, Term | Term[]> | Record<string, Term>;

export interface ExecuteOptions<C extends Client | undefined = Client> {
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

export type Execute = ExecuteSelect | ExecuteConstruct | ExecuteAsk | ExecuteUpdate

type Query = {
  code: string
  returnType: string
  execute: Execute
}

export function compile(query: string): Query {
  const parser = new Parser()
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
    code: moduleTemplate.replace('queryObject', JSON.stringify(queryObject)),
  }
}
