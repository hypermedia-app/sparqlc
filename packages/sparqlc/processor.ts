import sparqljs, {ConstructQuery, SparqlQuery} from "sparqljs";
import {Environment} from "@rdfjs/environment/Environment";
import {DataFactory, Term} from "@rdfjs/types";

export async function createProcessor(env: Environment<DataFactory>, params: Map<string, Term>) {
    const {default: Processor} = await import('@hydrofoil/sparql-processor')

    return new class extends Processor {
        private readonly vars: Set<string> = new Set()

        get param() {
            return this.factory.namedNode('https://sparqlc.described.at/param')
        }

        private paramVariable(name: string) {
            return this.factory.variable!(`_param_${name}`)
        }

        processConstructQuery(query: ConstructQuery): ConstructQuery {
            const processed = super.processConstructQuery(query);
            const values = <sparqljs.ValuesPattern>{
                type: 'values',
                values: [
                    Object.fromEntries([...this.vars].map(v => ["?" + this.paramVariable(v).value, params.get(v)]))
                ],
            }

            return {
                ...processed,
                where: [
                    values,
                    ...processed.where || [],
                ]
            }
        }

        processFunctionCall(functionCall: sparqljs.FunctionCallExpression) {
            if (typeof functionCall.function === 'object' && this.param.equals(functionCall.function)) {
                const varName = functionCall.args[0]
                if ('value' in varName && varName.termType === 'Literal') {
                    this.vars.add(varName.value)
                    return this.paramVariable(varName.value)
                }

                throw new Error(`Expected literal value for parameter name, got ${varName}`)
            }
            return super.processFunctionCall(functionCall);
        }

        override processTriple(triple: sparqljs.Triple) {
            if ('termType' in triple.predicate && this.param.equals(triple.predicate)) {
                const paramName = triple.object
                const varName = triple.subject.value
                const expression = params.get(paramName.value)

                if(!expression) {
                    throw new Error(`No value provided for parameter ${paramName.value}`)
                }

                return <sparqljs.BindPattern>{
                    type: 'bind',
                    variable: this.factory.variable!(varName),
                    expression,
                }
            }

            return triple
        }
    }(env)
}
