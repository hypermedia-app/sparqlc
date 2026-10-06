import rdf from '@rdfjs/data-model'
import type { NamedNode, Term, Variable } from '@rdfjs/types'
import type sparqljs from 'sparqljs'
import type { Env, FromOptions, OrderBy, OrderItem, OrderTuple, Params, QueryModifiers } from './sparqlc.js'

export function isEnv(arg: Env | unknown): arg is Env {
  return typeof arg === 'object' && arg !== null && 'dataset' in arg && typeof arg.dataset === 'function'
}

export function toTermMap(map: Map<Term, Term | Term[]>, params: Params): Map<Term, Term | Term[]> {
  if (params instanceof URLSearchParams) {
    for (const [key, value] of params.entries()) {
      map.set(rdf.literal(key), rdf.literal(value))
    }
  }
  else if (Symbol.iterator in params) {
    for (const [key, value] of params.entries()) {
      map.set(key, value)
    }
  }
  else {
    for (const key of Object.keys(params)) {
      if (params[key]) {
        map.set(rdf.literal(key), params[key])
      }
    }
  }

  return map
}

type NamedNodeSource = Term | string | { value: string }
type NamedNodesParam = NamedNodeSource | readonly NamedNodeSource[] | null | undefined

function toNamedNodes(env: Env, terms: NamedNodesParam): NamedNode[] {
  if (terms === undefined || terms === null) return []
  const arr = Array.isArray(terms) ? terms : [terms]
  return arr.map((t) => {
    if (typeof t === 'string') {
      return env.namedNode(t)
    }
    if (typeof t === 'object' && 'termType' in t && t.termType === 'NamedNode') {
      return t as NamedNode
    }
    if (typeof t === 'object' && 'value' in t && typeof t.value === 'string') {
      return env.namedNode(t.value)
    }
    return env.namedNode(String(t))
  })
}

type VariableSource = string | Variable | Term | { value: string }

function toVariableTerm(env: Env, v: VariableSource): sparqljs.VariableTerm {
  if (typeof v === 'object' && 'termType' in v && v.termType === 'Variable') {
    return v as sparqljs.VariableTerm
  }
  if (typeof v === 'string') {
    const varName = v.trim().replace(/^\?/, '')
    return env.variable!(varName)
  }
  if (typeof v === 'object' && 'value' in v && typeof v.value === 'string') {
    return env.variable!(v.value)
  }
  return env.variable!(String(v).replace(/^\?/, ''))
}

function isOrderTuple(item: unknown): item is OrderTuple {
  if (!Array.isArray(item)) return false
  if (item.length === 2) {
    const dir = item[1]
    if (typeof dir === 'string' && /^(asc|desc)$/i.test(dir.trim())) {
      return true
    }
    if (typeof dir === 'boolean') {
      return true
    }
  }
  return false
}

function normalizeOrderItem(env: Env, item: OrderItem | sparqljs.Ordering | null | undefined): sparqljs.Ordering | undefined {
  if (!item) return undefined

  if (isOrderTuple(item)) {
    const [expr, dir] = item
    const variable = toVariableTerm(env, expr)
    return dir.trim().toUpperCase() === 'DESC'
      ? { expression: variable, descending: true }
      : { expression: variable }
  }

  if (typeof item === 'string') {
    const trimmed = item.trim()
    if (!trimmed) return undefined
    return { expression: toVariableTerm(env, trimmed) }
  }

  if (typeof item === 'object') {
    if ('termType' in item && item.termType === 'Variable') {
      return { expression: item as sparqljs.VariableTerm }
    }
    if ('expression' in item) {
      const exprObj = item as { expression: VariableSource | sparqljs.Expression, descending?: boolean }
      let expression: sparqljs.Expression
      if (typeof exprObj.expression === 'string') {
        expression = toVariableTerm(env, exprObj.expression)
      }
      else if (typeof exprObj.expression === 'object' && 'termType' in exprObj.expression && (exprObj.expression as Term).termType === 'Variable') {
        expression = exprObj.expression as sparqljs.VariableTerm
      }
      else {
        expression = exprObj.expression as sparqljs.Expression
      }

      if (exprObj.descending) {
        return {
          ...(item as sparqljs.Ordering),
          expression,
          descending: true,
        }
      }
      const res = { ...(item as sparqljs.Ordering), expression }
      if ('descending' in res && !res.descending) {
        delete (res as { descending?: boolean }).descending
      }
      return res
    }
  }

  return undefined
}

function isArray<T>(arg: unknown): arg is readonly T[] {
  return Array.isArray(arg)
}

function normalizeOrder(env: Env, order: OrderBy | null | undefined): sparqljs.Ordering[] | undefined {
  if (order === null || order === undefined) return undefined

  if (isOrderTuple(order)) {
    return [normalizeOrderItem(env, order)!]
  }

  if (isArray<OrderItem>(order)) {
    const result: sparqljs.Ordering[] = []
    for (const item of order) {
      const normalized = normalizeOrderItem(env, item)
      if (normalized) {
        result.push(normalized)
      }
    }
    return result.length > 0 ? result : undefined
  }

  const normalized = normalizeOrderItem(env, order)
  return normalized ? [normalized] : undefined
}

export function applyModifiers<Q extends sparqljs.SparqlQuery>(query: Q, modifiers: QueryModifiers, env: Env): Q {
  if (query.type !== 'query') {
    return query
  }

  const modified = { ...query } as sparqljs.Query

  // DISTINCT
  if (modifiers.distinct !== undefined) {
    if (modifiers.distinct) {
      (modified as sparqljs.SelectQuery).distinct = true
    }
    else {
      delete (modified as sparqljs.SelectQuery).distinct
    }
  }

  // LIMIT
  if (modifiers.limit !== undefined) {
    if (modifiers.limit === null || modifiers.limit < 0) {
      delete (modified as sparqljs.SelectQuery).limit
    }
    else if (typeof modifiers.limit === 'number') {
      (modified as sparqljs.SelectQuery).limit = modifiers.limit
    }
  }

  // OFFSET
  if (modifiers.offset !== undefined) {
    if (modifiers.offset === null || modifiers.offset < 0) {
      delete (modified as sparqljs.SelectQuery).offset
    }
    else if (typeof modifiers.offset === 'number') {
      (modified as sparqljs.SelectQuery).offset = modifiers.offset
    }
  }

  // FROM / FROM NAMED
  if (modifiers.from === null) {
    delete modified.from
  }
  else if (modifiers.from !== undefined || modifiers.fromNamed !== undefined) {
    let defaultGraphs: NamedNode[] = []
    let namedGraphs: NamedNode[] = []
    let hasDefault = false
    let hasNamed = false

    if (modifiers.from !== undefined) {
      if (typeof modifiers.from === 'object' && !('termType' in modifiers.from) && !Array.isArray(modifiers.from)) {
        const fromObj = modifiers.from as FromOptions
        if (fromObj.default !== undefined) {
          defaultGraphs = toNamedNodes(env, fromObj.default)
          hasDefault = true
        }
        if (fromObj.named !== undefined) {
          namedGraphs = toNamedNodes(env, fromObj.named)
          hasNamed = true
        }
      }
      else {
        defaultGraphs = toNamedNodes(env, modifiers.from)
        hasDefault = true
      }
    }

    if (modifiers.fromNamed !== undefined && modifiers.fromNamed !== null) {
      namedGraphs = toNamedNodes(env, modifiers.fromNamed)
      hasNamed = true
    }

    if (hasDefault || hasNamed) {
      const existingFrom = query.from
      modified.from = {
        default: hasDefault ? defaultGraphs : (existingFrom?.default || []),
        named: hasNamed ? namedGraphs : (existingFrom?.named || []),
      }
      if (modified.from.default.length === 0 && modified.from.named.length === 0) {
        delete modified.from
      }
    }
  }

  // ORDER BY
  if (modifiers.orderBy !== undefined) {
    if (modifiers.orderBy === null) {
      delete (modified as sparqljs.SelectQuery).order
    }
    else {
      const normalized = normalizeOrder(env, modifiers.orderBy)
      if (normalized && normalized.length > 0) {
        (modified as sparqljs.SelectQuery).order = normalized
      }
      else {
        delete (modified as sparqljs.SelectQuery).order
      }
    }
  }

  return modified as Q
}
