import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Parser } from 'sparqljs'
import type { DatasetCore, Stream, Term } from '@rdfjs/types'
import type { Client } from 'sparql-http-client'
import type { StreamClient } from 'sparql-http-client/StreamClient.js'
import rdf from '@zazuko/env'
import type Processor from '@hydrofoil/sparql-processor'
import type { Env } from './QueryAnalyzer.js'
import QueryAnalyzer from './QueryAnalyzer.js'

const require = createRequire(import.meta.url)

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
  module: string
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

  let module = moduleTemplate.replace('queryObject', JSON.stringify(queryObject))
  return {
    async execute(...args) {
      module = [
        'sparqlc/processor.js',
        'sparqlc/runtime.js',
        'sparqljs',
        '@rdfjs/term-map',
      ].reduce(resolveModule, module)
      const encodedCode = Buffer.from(module).toString('base64')
      const moduleDataUri = `data:text/javascript;base64,${encodedCode}`
      const { default: execute } = await import(moduleDataUri)

      return execute(...args)
    },
    returnType,
    module,
  }
}

function resolveModule(module: string, importSpecifier: string) {
  const path = require.resolve(importSpecifier)
  const importUrl = pathToFileURL(path).href
  return module.replace(`'${importSpecifier}'`, `'${importUrl}'`)
}
