import type { DatasetCore, Stream, Term } from '@rdfjs/types'
import type { ParsingClient, StreamClient } from 'sparql-http-client'
import sinon from 'sinon'
import env from '@zazuko/env'
import { createStore, createEmpty } from 'mocha-chai-rdf/store.js'
import { expect, use } from 'chai'
import snapshots from 'mocha-chai-rdf/snapshots.js'
import type { ExecuteAsk, ExecuteConstruct, ExecuteSelect, ExecuteUpdate } from '../index.js'

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

  describe('query', function () {
    before(createStore(import.meta.url))

    describe('select', function () {
      it('applies base URI from options', async function () {
        // given
        const { default: query } = await import('./queries/select-relative-uris.rq', {
          with: {
            base: fruits().value,
          },
        })

        // when
        const result = await query({
          env,
          client: this.rdf.parsingClient,
        })

        // then
        expect(result).to.deep.include({
          label: env.literal('Banana'),
        })
      })
    })

    describe('construct', function () {
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

    describe('construct with subselect', function () {
      it('binds parameter with named node key', async function () {
        // given
        const { default: query } = await import('./queries/construct-subselect.rq')
        const params = env.termMap([
          [env.ns.schema.mainEntity, fruits.Banana],
        ])

        // when
        const result = await query(params, { env, client: this.rdf.parsingClient })

        // then
        expect(result).canonical.toMatchSnapshot()
      })
    })

    describe('describe', function () {
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

  describe('update', function () {
    describe('insert data', function () {
      before(createEmpty)

      it('writes triples to the store', async function () {
        // given
        const { default: query } = await import('./queries/insert-data.ru')

        // when
        await query({ env, client: this.rdf.parsingClient })

        // then
        expect(this.rdf.dataset).canonical.toMatchSnapshot()
      })
    })

    describe('insert where', function () {
      before(createStore(import.meta.url))

      const ex = env.namespace('http://example.org/')

      it('binds params and writes to store', async function () {
        // given
        const { default: query } = await import('./queries/insert-where-only-bind.ru')

        // when
        await query({
          foo: ex.foo,
          baz: env.literal('baz'),
        }, { env, client: this.rdf.parsingClient })

        // then
        const graph = this.rdf.dataset.match(null, null, null, ex.g)
        expect(graph).canonical.toMatchSnapshot()
      })

      it('accesses existing data', async function () {
        // given
        const { default: query } = await import('./queries/insert-where.ru')

        // when
        await query({
          type: ex('fruits/Fruit'),
        }, { env, client: this.rdf.parsingClient })

        // then
        const labels = this.rdf.graph
          .has(env.ns.rdf.type, ex('fruits/Fruit'))
          .out(env.ns.rdfs.label)
        expect(labels.values.sort()).toMatchSnapshot()
      })

      it('can delete existing data', async function () {
        // given
        const { default: query } = await import('./queries/insert-delete.ru')

        // when
        await query({
          type: ex('fruits/Fruit'),
        }, { env, client: this.rdf.parsingClient })

        // then
        const labels = this.rdf.graph
          .has(env.ns.rdf.type, ex('fruits/Fruit'))
          .out(env.ns.rdfs.label)
        expect(labels.values.sort()).toMatchSnapshot()
      })

      it('processes multiple operations', async function () {
        // given
        const { default: query } = await import('./queries/insert-multiple.ru')

        // when
        await query({
          type: ex('fruits/Fruit'),
        }, { env, client: this.rdf.parsingClient })

        // then
        const labels = this.rdf.graph
          .has(env.ns.rdf.type, ex('fruits/Fruit'))
          .out(env.ns.rdfs.label)
        expect(labels.values.sort()).toMatchSnapshot()

        const watermelon = this.rdf.dataset
          .match(ex('fruits/Watermelon'))
        expect(watermelon).canonical.toMatchSnapshot()

        const crunchy = this.rdf.dataset
          .match(ex('fruit/isCrunchy'))
        expect(crunchy.size).to.eq(0)
      })
    })
  })
})
