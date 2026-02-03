import Processor from "@hydrofoil/sparql-processor";
import sparqljs, {SelectQuery, SparqlQuery, Variable, Wildcard} from "sparqljs";
import {DataFactory, NamedNode, Term} from "@rdfjs/types";
import {Environment} from "@rdfjs/environment/Environment.js";
import {TermSetFactory} from '@rdfjs/term-set/Factory.js'

export type Env = Environment<DataFactory | TermSetFactory>

export default class<F extends Env = Env> extends Processor<Env> {
    public readonly parameters: Set<Term>
    protected readonly param: NamedNode<"https://sparqlc.described.at/param">;
    private queryType?: string
    private selectVars: Variable[] | [Wildcard] = []

    constructor(factory: F) {
        super(factory);
        this.param = this.factory.namedNode('https://sparqlc.described.at/param')
        this.parameters = this.factory.termSet()
    }

    get returnType() {
        switch (this.queryType) {
            case 'SELECT':
                return `Array<{ ${[...this.selectVars].map(expr => {
                    const varName = 'termType' in expr ? expr.value: expr.variable.value
                    
                    return `${varName}: import('@rdfjs/types').Term`;
                }).join('; ')} }>`
            case 'CONSTRUCT':
            case 'DESCRIBE':
                return 'Stream'
            case 'ASK':
                return 'boolean'
            case "UPDATE":
                return 'void'
            default:
                return 'unknown'
        }
    }

    process<Q extends SparqlQuery>(query: Q): Q {
        this.queryType = query.type === 'query'
            ? query.queryType
            : 'UPDATE'

        return super.process(query);
    }

    processSelectQuery(query: SelectQuery): SelectQuery {
        this.selectVars = query.variables

        return super.processSelectQuery(query);
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
        return super.processFunctionCall(functionCall);
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
