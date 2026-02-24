import Processor from '@hydrofoil/sparql-processor'
import type { SelectQuery, SparqlQuery, Variable, Wildcard } from 'sparqljs'
import type sparqljs from 'sparqljs'
import type { DataFactory, NamedNode, Term } from '@rdfjs/types'
import type { Environment } from '@rdfjs/environment/Environment.js'
import type { TermSetFactory } from '@rdfjs/term-set/Factory.js'

export type Env = Environment<DataFactory | TermSetFactory>

export default class <F extends Env = Env> extends Processor<Env> {
  public readonly parameters: Set<Term>
  protected readonly param: NamedNode<'https://sparqlc.described.at/param'>
  private queryType?: string
  private selectVars: Variable[] | [Wildcard] = []

  constructor(factory: F) {
    super(factory)
    this.param = this.factory.namedNode('https://sparqlc.described.at/param')
    this.parameters = this.factory.termSet()
  }

  get returnType() {
    switch (this.queryType) {
      case 'SELECT': {
        const varNames = [...this.selectVars].map(expr => {
          return 'termType' in expr ? expr.value : expr.variable.value
        })

        if (varNames.includes('*') || varNames.length === 0) {
          return 'Select<Record<string, Term>>'
        }

        return `Select<Record<${varNames.map(v => `'${v}'`).join(' | ')}, Term>>`
      }
      case 'CONSTRUCT':
      case 'DESCRIBE':
        return 'Construct'
      case 'ASK':
        return 'Ask'
      case 'UPDATE':
        return 'Update'
      default:
        return 'unknown'
    }
  }

  process<Q extends SparqlQuery>(query: Q): Q {
    this.queryType = query.type === 'query'
      ? query.queryType
      : 'UPDATE'

    return super.process(query)
  }

  processSelectQuery(query: SelectQuery): SelectQuery {
    this.selectVars = query.variables

    return super.processSelectQuery(query)
  }

  processFunctionCall(functionCall: sparqljs.FunctionCallExpression) {
    if (typeof functionCall.function === 'object' && this.param.equals(functionCall.function)) {
      const varTerm = functionCall.args[0]
      if ('value' in varTerm) {
        this.parameters.add(varTerm)
        return this.processParamFunctionCall(varTerm) || super.processFunctionCall(functionCall)
      }

      throw new Error(`Expected literal value for parameter name, got ${varTerm}`)
    }
    return super.processFunctionCall(functionCall)
  }

  override processTriple(triple: sparqljs.Triple) {
    if ('termType' in triple.predicate && this.param.equals(triple.predicate)) {
      this.parameters.add(triple.subject)

      return this.processParamTriple(triple)
    }

    return triple
  }

  protected processParamTriple(triple: sparqljs.Triple): sparqljs.Triple | sparqljs.Pattern {
    return triple
  }

  protected processParamFunctionCall(term: Term): sparqljs.Expression | undefined {
    return undefined
  }
}
