import type { DatasetCore, Stream, Term } from '@rdfjs/types'
import type { ParsingClient, StreamClient } from 'sparql-http-client'
import sinon from 'sinon'
import { create } from '@zazuko/env'
import { createStore } from 'mocha-chai-rdf/store.js'
import { expect, use } from 'chai'
import snapshots from 'mocha-chai-rdf/snapshots.js'
import type { ExecuteAsk, ExecuteConstruct, ExecuteSelect, ExecuteUpdate } from '../index.js'
const env = create()

const fruits = env.namespace('http://example.org/fruits/')

use(snapshots)

describe('sparqlc', function () {
  describe('types', function () {
    const streamClient: StreamClient = {} as StreamClient
    const parsingClient: ParsingClient = {} as ParsingClient

    describe('construct query', function () {
      it('stream client returns stream', async function () {
        const query: ExecuteConstruct = sinon.stub()

        const result: Stream = await query({ env, client: streamClient })
      })

      it('parsing client returns dataset', async function () {
        const query: ExecuteConstruct = sinon.stub()

        const result: DatasetCore = await query({ env, client: parsingClient })
      })
    })

    describe('select query', function () {
      it('stream client returns generator', async function () {
        const query: ExecuteSelect<Record<'foo', Term>> = sinon.stub()

        const result: AsyncGenerator<Record<'foo', Term>> = await query({ env, client: streamClient })
      })

      it('parsing client returns bindings', async function () {
        const query: ExecuteSelect<Record<'foo', Term>> = sinon.stub()

        const result: Record<'foo', Term>[] = await query({ env, client: parsingClient })
      })
    })

    describe('ask query', function () {
      it('stream client returns boolean', async function () {
        const query: ExecuteAsk = sinon.stub()

        const result: boolean = await query({ env, client: streamClient })
      })

      it('parsing client returns boolean', async function () {
        const query: ExecuteAsk = sinon.stub()

        const result: boolean = await query({ env, client: parsingClient })
      })
    })

    describe('update query', function () {
      it('stream client returns boolean', async function () {
        const query: ExecuteUpdate = sinon.stub()

        const result: void = await query({ env, client: streamClient })
      })

      it('parsing client returns void', async function () {
        const query: ExecuteUpdate = sinon.stub()

        const result: void = await query({ env, client: parsingClient })
      })
    })
  })

  describe('execute', function () {
    before(createStore(import.meta.url))

    describe('construct query', function () {
      it('binds parameter with named node key', async function () {
        // given
        const { default: query } = await import('./queries/construct-named-node-param.rq')
        const params = env.termMap([
          [env.ns.schema.mainEntity, fruits.Banana],
        ])

        // when
        const result = await query(params, { env, client: this.rdf.parsingClient })

        // then
        expect(result).canonical.toMatchSnapshot()
      })
    })

    describe('describe query', function () {
      it('binds parameter with named node key', async function () {
        // given
        const { default: query } = await import('./queries/describe-named-node-param.rq')
        const params = env.termMap([
          [env.ns.schema.mainEntity, fruits.Banana],
        ])

        // when
        const result = await query(params, { env, client: this.rdf.parsingClient })

        // then
        expect(result).canonical.toMatchSnapshot()
      })
    })
  })
})
