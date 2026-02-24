import { createEmpty } from 'mocha-chai-rdf/store.js'
import matchers from 'mocha-chai-rdf/matchers.js'
import snapshots from 'mocha-chai-rdf/snapshots.js'
import { expect, use } from 'chai'
import env from '@zazuko/env'
import type { DatasetCore } from '@rdfjs/types'
import select from './queries/select.rq'
import selectAll from './queries/select-all.rq'
import construct from './queries/construct.rq'

use(matchers)
use(snapshots)

describe('node-loader-sparql', function () {
  beforeEach(createEmpty)

  describe('select ?var', function () {
    it('works in static import', async function () {
      const bindings = await select({
        env,
        client: this.rdf.parsingClient,
      })

      expect(bindings[0].greeting).to.equal(env.literal('Hello World'))
    })

    it('works in dynamic import', async function () {
      const { default: select } = await import('./queries/select.rq')

      const bindings = await select({
        env,
        client: this.rdf.parsingClient,
      })

      expect(bindings[0].greeting).to.equal(env.literal('Hello World'))
    })
  })

  describe('select *', function () {
    it('works in static import', async function () {
      const [{ greeting }] = await selectAll({
        env,
        client: this.rdf.parsingClient,
      })

      expect(greeting).to.equal(env.literal('Hello World'))
    })

    it('works in dynamic import', async function () {
      const { default: selectAll } = await import('./queries/select-all.rq')

      const [{ greeting }] = await selectAll({
        env,
        client: this.rdf.parsingClient,
      })

      expect(greeting).to.equal(env.literal('Hello World'))
    })
  })

  describe('construct', function () {
    it('works in static import', async function () {
      const dataset: DatasetCore = await construct({
        env,
        client: this.rdf.parsingClient,
      })

      expect(dataset).canonical.toMatchSnapshot()
    })

    it('works in dynamic import', async function () {
      const { default: construct } = await import('./queries/construct.rq')

      const stream = await construct({
        env,
        client: this.rdf.streamClient,
      })

      const dataset = await env.dataset().import(stream)
      expect(dataset).canonical.toMatchSnapshot()
    })
  })
})
