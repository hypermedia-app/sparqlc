import type sparqljs from 'sparqljs'
import type { Term } from '@rdfjs/types'
import { shrink } from '@zazuko/prefixes'
import type { Env } from './QueryAnalyzer.js'
import QueryAnalyzer from './QueryAnalyzer.js'

export default class extends QueryAnalyzer {
  private paramVariable(varKey: Term) {
    if (['Quad', 'BlankNode', 'Variable', 'DefaultGraph'].includes(varKey.termType)) {
      throw new Error('Only NamedNodes and Literals are supported as parameters')
    }

    if (varKey.termType === 'Literal') {
      return this.factory.variable!(`_param_${varKey.value}`)
    }

    const shrunk = shrink(varKey.value)?.replace(':', '_')
    if (shrunk) {
      return this.factory.variable!(`_param_${shrunk}`)
    }

    const url = new URL(varKey.value)
    const lastSegmentOrHash = url.hash?.substring(1) || url.pathname.split('/').pop()!
    return this.factory.variable!(`_param_${lastSegmentOrHash}`)
  }

  constructor(factory: Env, private params: Map<Term, Term | Term[]>) {
    super(factory)
  }

  processSelectQuery(query: sparqljs.SelectQuery): sparqljs.SelectQuery {
    const processed = super.processSelectQuery(query)
    const values = this.parametersValuesClause

    return {
      ...processed,
      variables: processed.variables.map(variable => {
        if ('termType' in variable) return variable

        return <sparqljs.Wildcard>{
          termType: 'Wildcard',
          value: '*',
        }
      }) as sparqljs.Variable[] | [sparqljs.Wildcard],
      where: [
        ...(values ? [values] : []),
        ...processed.where || [],
      ],
    }
  }

  processConstructQuery(query: sparqljs.ConstructQuery): sparqljs.ConstructQuery {
    return this.processGraphQuery(super.processConstructQuery(query))
  }

  processDescribe(query: sparqljs.DescribeQuery): sparqljs.DescribeQuery {
    return this.processGraphQuery(super.processDescribe(query))
  }

  private processGraphQuery<Q extends sparqljs.DescribeQuery | sparqljs.ConstructQuery>(query: Q): Q {
    if (this.parameters.size === 0) {
      return query
    }

    const values = this.parametersValuesClause

    return {
      ...query,
      where: [
        ...(values ? [values] : []),
        ...query.where || [],
      ],
    }
  }

  private get parametersValuesClause(): sparqljs.ValuesPattern | null {
    const values = Object.fromEntries([...this.parameters].flatMap(v => {
      const valueOrArray = this.params.get(v)
      if (!valueOrArray) return []

      return (Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray])
        .filter(this.isValidValuesValue)
        .map(value => {
          return ['?' + this.paramVariable(v).value, value]
        })
    }))

    if (Object.keys(values).length === 0) return null

    return {
      type: 'values',
      values: [
        values,
      ],
    }
  }

  private isValidValuesValue(value: Term) {
    return value.termType === 'Literal' || value.termType === 'NamedNode' || value.termType === 'BlankNode'
  }

  override processParamFunctionCall(varTerm: Term) {
    return this.paramVariable(varTerm)
  }

  override processParamTriple(triple: sparqljs.Triple) {
    const paramTerm = triple.object
    const varName = triple.subject.value
    const expression = this.params.get(paramTerm)

    if (!expression) {
      throw new Error(`No value provided for parameter ${paramTerm.value}`)
    }

    return <sparqljs.BindPattern>{
      type: 'bind',
      variable: this.factory.variable!(varName),
      expression,
    }
  }
}
