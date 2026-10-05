import type { DatasetCore, Term } from '@rdfjs/types'
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

        const _result = await query({ env, client: streamClient })
      })

      it('parsing client returns dataset', async function () {
        const query: ExecuteConstruct = sinon.stub()

        const _result: DatasetCore = await query({ env, client: parsingClient })
      })
    })

    describe('select query', function () {
      it('stream client returns generator', async function () {
        const query: ExecuteSelect<Record<'foo', Term>> = sinon.stub()

        const _result: AsyncGenerator<Record<'foo', Term>> = await query({ env, client: streamClient })
      })

      it('parsing client returns bindings', async function () {
        const query: ExecuteSelect<Record<'foo', Term>> = sinon.stub()

        const _result: Record<'foo', Term>[] = await query({ env, client: parsingClient })
      })

      it('typechecks order variables', async function () {
        const query: ExecuteSelect<Record<'foo', Term>, 'foo' | 'bar'> = sinon.stub()

        // Valid variables
        await query({ env, client: parsingClient, orderBy: 'bar' })
        await query({ env, client: parsingClient, orderBy: [['bar', 'DESC'], 'foo'] })

        // @ts-expect-error 'baz' is not in 'foo' | 'bar'
        await query({ env, client: parsingClient, orderBy: 'baz' })
        // @ts-expect-error 'baz' is not in 'foo' | 'bar'
        await query({ env, client: parsingClient, orderBy: [['baz', 'DESC']] })
      })
    })

    describe('ask query', function () {
      it('stream client returns boolean', async function () {
        const query: ExecuteAsk = sinon.stub()

        const _result: boolean = await query({ env, client: streamClient })
      })

      it('parsing client returns boolean', async function () {
        const query: ExecuteAsk = sinon.stub()

        const _result: boolean = await query({ env, client: parsingClient })
      })
    })

    describe('update query', function () {
      it('stream client returns boolean', async function () {
        const query: ExecuteUpdate = sinon.stub()

        const _result: void = await query({ env, client: streamClient })
      })

      it('parsing client returns void', async function () {
        const query: ExecuteUpdate = sinon.stub()

        const _result: void = await query({ env, client: parsingClient })
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

      it('does not remove aggregation from selected variables', async function () {
        // given
        const { default: query } = await import('./queries/aggregations/wildcard-no-param.rq')

        // when
        const result = await query({
          env,
          client: this.rdf.parsingClient,
        })

        // then
        expect(result[0].fruits.value).to.eq('4')
      })

      describe('runtime options', function () {
        it('applies distinct', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            distinct: true,
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('removes distinct when false', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({ env, distinct: false })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies limit and offset', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            limit: 10,
            offset: 5,
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('limits executed query results', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const result = await query({
            env,
            client: this.rdf.parsingClient,
            limit: 2,
          })

          // then
          expect(result.map((row: Record<string, { value: string }>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])))).toMatchSnapshot()
        })

        it('applies from default graph', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            from: env.namedNode('http://example.org/graph'),
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies from default and named graphs via FromOptions', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            from: {
              default: 'http://example.org/default-graph',
              named: ['http://example.org/named-graph-1', env.namedNode('http://example.org/named-graph-2')],
            },
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies fromNamed option', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            fromNamed: ['http://example.org/named-1'],
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies order by variable', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            orderBy: env.variable('label'),
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies order by descending expression object', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            orderBy: [{ expression: env.variable('label'), descending: true }],
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies order by array with tuples and strings', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            orderBy: [
              ['label', 'DESC'],
              'fruit',
            ],
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('executes query with order by at runtime', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const ascResult = await query({
            env,
            client: this.rdf.parsingClient,
            orderBy: ['label', 'ASC'],
          })
          const descResult = await query({
            env,
            client: this.rdf.parsingClient,
            orderBy: ['label', 'DESC'],
          })

          // then
          expect(ascResult.map((row: Record<string, { value: string }>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])))).toMatchSnapshot()
          expect(descResult.map((row: Record<string, { value: string }>) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.value])))).toMatchSnapshot()
        })

        it('removes order by when null or empty', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            orderBy: null,
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('removes limit and offset when null or negative', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            limit: null,
            offset: -1,
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('removes dataset clauses when from is null', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            from: null,
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies string variable to orderBy', async function () {
          // given
          const { default: query } = await import('./queries/select-star.rq')

          // when
          const queryString = await query({
            env,
            orderBy: 'fruit',
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies modifiers to construct query', async function () {
          // given
          const { default: query } = await import('./queries/construct-named-node-param.rq')
          const params = env.termMap([
            [env.ns.schema.mainEntity, fruits.Banana],
          ])

          // when
          const queryString = await query(params, {
            env,
            limit: 5,
            offset: 10,
            from: 'http://example.org/graph',
          })

          // then
          expect(queryString).toMatchSnapshot()
        })

        it('applies modifiers to ask query', async function () {
          // given
          const { default: query } = await import('./queries/ask.rq')

          // when
          const queryString = await query({
            env,
            fromNamed: 'http://example.org/named-graph',
          })

          // then
          expect(queryString).toMatchSnapshot()
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
