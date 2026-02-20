import type { ConstructQuery } from 'sparqljs'
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

  processConstructQuery(query: ConstructQuery): ConstructQuery {
    const processed = super.processConstructQuery(query)
    if (this.parameters.size === 0) {
      return processed
    }

    const values = <sparqljs.ValuesPattern>{
      type: 'values',
      values: [
        Object.fromEntries([...this.parameters].flatMap(v => {
          const valueOrArray = this.params.get(v)
          if (Array.isArray(valueOrArray)) {
            return valueOrArray.map(value => ['?' + this.paramVariable(v).value, value])
          }
          if (valueOrArray) {
            return [['?' + this.paramVariable(v).value, valueOrArray]]
          }

          return []
        })),
      ],
    }

    return {
      ...processed,
      where: [
        values,
        ...processed.where || [],
      ],
    }
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
