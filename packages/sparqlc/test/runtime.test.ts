import env from '@zazuko/env'
import { expect } from 'chai'
import type sparqljs from 'sparqljs'
import { isEnv, toTermMap, applyModifiers } from '../runtime.js'

describe('runtime helpers', function () {
  describe('isEnv', function () {
    it('returns true for valid RDF/JS env', function () {
      expect(isEnv(env)).to.be.true
    })

    it('returns false for null, undefined, or non-env objects', function () {
      expect(isEnv(null)).to.be.false
      expect(isEnv(undefined)).to.be.false
      expect(isEnv({})).to.be.false
      expect(isEnv('string')).to.be.false
    })
  })

  describe('toTermMap', function () {
    it('converts URLSearchParams', function () {
      const searchParams = new URLSearchParams([['foo', 'bar'], ['baz', 'qux']])
      const map = toTermMap(env.termMap(), searchParams)

      expect(map.get(env.literal('foo'))).to.deep.eq(env.literal('bar'))
      expect(map.get(env.literal('baz'))).to.deep.eq(env.literal('qux'))
    })

    it('converts plain Record objects', function () {
      const record = { foo: env.literal('bar') }
      const map = toTermMap(env.termMap(), record)

      expect(map.get(env.literal('foo'))).to.deep.eq(env.literal('bar'))
    })

    it('converts Map or iterable with Term keys', function () {
      const inputMap = env.termMap([[env.namedNode('http://example.org/key'), env.literal('val')]])
      const map = toTermMap(env.termMap(), inputMap)

      expect(map.get(env.namedNode('http://example.org/key'))).to.deep.eq(env.literal('val'))
    })
  })

  describe('applyModifiers', function () {
    it('returns non-query unmodified', function () {
      const updateQuery: sparqljs.Update = {
        prefixes: {},
        type: 'update',
        updates: [],
      }

      const result = applyModifiers(updateQuery, { limit: 10, distinct: true }, env)
      expect(result).to.eq(updateQuery)
    })

    it('clears dataset when empty arrays passed to from', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        from: {
          default: [env.namedNode('http://example.org/g1')],
          named: [],
        },
      }

      const result = applyModifiers(query, { from: { default: [], named: [] } }, env) as sparqljs.SelectQuery
      expect(result.from).to.be.undefined
    })

    it('preserves existing default graph when only fromNamed is supplied', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        from: {
          default: [env.namedNode('http://example.org/default')],
          named: [],
        },
      }

      const result = applyModifiers(query, { fromNamed: 'http://example.org/named' }, env) as sparqljs.SelectQuery
      expect(result.from?.default).to.deep.eq([env.namedNode('http://example.org/default')])
      expect(result.from?.named).to.deep.eq([env.namedNode('http://example.org/named')])
    })

    it('preserves existing named graph when only from default is supplied', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        from: {
          default: [],
          named: [env.namedNode('http://example.org/named')],
        },
      }

      const result = applyModifiers(query, { from: 'http://example.org/default' }, env) as sparqljs.SelectQuery
      expect(result.from?.default).to.deep.eq([env.namedNode('http://example.org/default')])
      expect(result.from?.named).to.deep.eq([env.namedNode('http://example.org/named')])
    })

    it('removes existing order when empty orderBy is supplied', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        order: [{ expression: env.variable('s') }],
      }

      const result = applyModifiers(query, { orderBy: [] }, env) as sparqljs.SelectQuery
      expect(result.order).to.be.undefined
    })

    it('applies and removes distinct modifier', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const distinctQuery = applyModifiers(query, { distinct: true }, env) as sparqljs.SelectQuery
      expect(distinctQuery.distinct).to.be.true

      const nonDistinctQuery = applyModifiers(distinctQuery, { distinct: false }, env) as sparqljs.SelectQuery
      expect(nonDistinctQuery.distinct).to.be.undefined
    })

    it('applies and removes limit and offset modifiers', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const withLimitOffset = applyModifiers(query, { limit: 10, offset: 20 }, env) as sparqljs.SelectQuery
      expect(withLimitOffset.limit).to.eq(10)
      expect(withLimitOffset.offset).to.eq(20)

      const clearedLimit = applyModifiers(withLimitOffset, { limit: null, offset: null }, env) as sparqljs.SelectQuery
      expect(clearedLimit.limit).to.be.undefined
      expect(clearedLimit.offset).to.be.undefined

      const negativeLimit = applyModifiers(withLimitOffset, { limit: -1, offset: -5 }, env) as sparqljs.SelectQuery
      expect(negativeLimit.limit).to.be.undefined
      expect(negativeLimit.offset).to.be.undefined
    })

    it('removes from when null', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        from: {
          default: [env.namedNode('http://example.org/g1')],
          named: [],
        },
      }

      const result = applyModifiers(query, { from: null }, env) as sparqljs.SelectQuery
      expect(result.from).to.be.undefined

      const resultNullParts = applyModifiers(query, { from: { default: null, named: null } }, env) as sparqljs.SelectQuery
      expect(resultNullParts.from).to.be.undefined
    })

    it('sets default or named graph on queries without existing from clause', function () {
      const query1: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const res1 = applyModifiers(query1, { from: 'http://example.org/default' }, env) as sparqljs.SelectQuery
      expect(res1.from?.default).to.deep.eq([env.namedNode('http://example.org/default')])
      expect(res1.from?.named).to.deep.eq([])

      const res2 = applyModifiers(query1, { fromNamed: 'http://example.org/named' }, env) as sparqljs.SelectQuery
      expect(res2.from?.default).to.deep.eq([])
      expect(res2.from?.named).to.deep.eq([env.namedNode('http://example.org/named')])
    })

    it('removes orderBy when null, boolean, or invalid value', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
        order: [{ expression: env.variable('s') }],
      }

      const resultNull = applyModifiers(query, { orderBy: null }, env) as sparqljs.SelectQuery
      expect(resultNull.order).to.be.undefined

      const resultFalse = applyModifiers(query, { orderBy: false as unknown as null }, env) as sparqljs.SelectQuery
      expect(resultFalse.order).to.be.undefined

      const resultEmpty = applyModifiers(query, { orderBy: '' }, env) as sparqljs.SelectQuery
      expect(resultEmpty.order).to.be.undefined

      const resultInvalid = applyModifiers(query, { orderBy: {} as unknown as null }, env) as sparqljs.SelectQuery
      expect(resultInvalid.order).to.be.undefined
    })

    it('supports single order item (string, variable term, or single tuple)', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const withString = applyModifiers(query, { orderBy: 's' }, env) as sparqljs.SelectQuery
      expect(withString.order).to.deep.eq([{ expression: env.variable('s') }])

      const withVariable = applyModifiers(query, { orderBy: env.variable('s') }, env) as sparqljs.SelectQuery
      expect(withVariable.order).to.deep.eq([{ expression: env.variable('s') }])

      const withTuple = applyModifiers(query, { orderBy: ['s', 'DESC'] }, env) as sparqljs.SelectQuery
      expect(withTuple.order).to.deep.eq([{ expression: env.variable('s'), descending: true }])
    })

    it('supports various from node representations', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const result = applyModifiers(query, {
        from: {
          default: [env.namedNode('http://example.org/d0'), 123 as unknown as string],
          named: [env.namedNode('http://example.org/n0')],
        },
      }, env) as sparqljs.SelectQuery

      expect(result.from?.default).to.deep.eq([
        env.namedNode('http://example.org/d0'),
        env.namedNode('123'),
      ])
      expect(result.from?.named).to.deep.eq([
        env.namedNode('http://example.org/n0'),
      ])
    })

    it('supports diverse valid orderBy representations', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const rawExpr: sparqljs.Expression = {
        type: 'operation',
        operator: '!',
        args: [env.variable('s')],
      }

      const result = applyModifiers(query, {
        orderBy: [
          [env.variable('s'), 'DESC'],
          ['s', 'ASC'],
          [env.variable('s'), 'DESC'],
          ['s', 'ASC'],
          [123 as unknown as string, 'DESC'],
          { expression: 'label', descending: true },
          { expression: env.variable('title'), descending: false },
          { expression: rawExpr },
        ],
      }, env) as sparqljs.SelectQuery

      expect(result.order).to.deep.eq([
        { expression: env.variable('s'), descending: true },
        { expression: env.variable('s') },
        { expression: env.variable('s'), descending: true },
        { expression: env.variable('s') },
        { expression: env.variable('123'), descending: true },
        { expression: env.variable('label'), descending: true },
        { expression: env.variable('title') },
        { expression: rawExpr },
      ])
    })

    it('ignores invalid or empty order items in array', function () {
      const query: sparqljs.SelectQuery = {
        prefixes: {},
        type: 'query',
        queryType: 'SELECT',
        variables: [env.variable('s')],
        where: [],
      }

      const result = applyModifiers(query, {
        orderBy: [
          's',
          '   ',
          null as unknown as string,
          {} as unknown as string,
        ],
      }, env) as sparqljs.SelectQuery

      expect(result.order).to.deep.eq([
        { expression: env.variable('s') },
      ])
    })
  })
})
