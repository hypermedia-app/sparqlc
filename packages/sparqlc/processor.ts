import type sparqljs from 'sparqljs'
import type { Term } from '@rdfjs/types'
import { shrink } from '@zazuko/prefixes'
import type { Env } from './QueryAnalyzer.js'
import QueryAnalyzer from './QueryAnalyzer.js'

interface ParamBinding {
  variableName: string
  bindPattern: sparqljs.BindPattern
  paramTerms: Set<Term>
}

interface ScopeContext {
  directParams: Set<Term>
  directUsedVars: Set<string>
  allUsedVars: Set<string>
  definedParamBindings: Map<string, ParamBinding>
  claimedByChild: Set<string>
  availableParamBindings: Map<string, ParamBinding>
}

function collectVariablesFromExpression(expr: sparqljs.Expression | sparqljs.Pattern | sparqljs.Wildcard | undefined, vars: Set<string>) {
  if (!expr) return
  if ('termType' in expr) {
    if (expr.termType === 'Variable') {
      vars.add(expr.value)
    }
  }
  else if ('type' in expr) {
    if (expr.type === 'operation' || expr.type === 'functionCall') {
      for (const arg of expr.args) {
        collectVariablesFromExpression(arg, vars)
      }
    }
    else if (expr.type === 'aggregate') {
      if ('expression' in expr && expr.expression) {
        collectVariablesFromExpression(expr.expression, vars)
      }
    }
  }
}

function collectVariablesFromTriple(triple: sparqljs.Triple, vars: Set<string>) {
  if (triple.subject.termType === 'Variable') vars.add(triple.subject.value)
  if ('termType' in triple.predicate && triple.predicate.termType === 'Variable') vars.add(triple.predicate.value)
  if (triple.object.termType === 'Variable') vars.add(triple.object.value)
}

function collectVariablesFromPattern(pattern: sparqljs.Pattern, vars: Set<string>, recursive: boolean = true) {
  switch (pattern.type) {
    case 'bgp':
      for (const triple of pattern.triples) {
        collectVariablesFromTriple(triple, vars)
      }
      break
    case 'filter':
      collectVariablesFromExpression(pattern.expression, vars)
      break
    case 'bind':
      collectVariablesFromExpression(pattern.expression, vars)
      break
    case 'values':
      for (const row of pattern.values) {
        for (const key of Object.keys(row)) {
          vars.add(key.startsWith('?') ? key.substring(1) : key)
        }
      }
      break
    case 'graph':
      if (pattern.name.termType === 'Variable') vars.add(pattern.name.value)
      if (recursive && pattern.patterns) {
        for (const p of pattern.patterns) collectVariablesFromPattern(p, vars, true)
      }
      break
    case 'optional':
    case 'service':
    case 'minus':
    case 'group':
      if (pattern.type === 'service' && pattern.name.termType === 'Variable') vars.add(pattern.name.value)
      if (recursive && pattern.patterns) {
        for (const p of pattern.patterns) collectVariablesFromPattern(p, vars, true)
      }
      break
    case 'union':
      if (recursive && pattern.patterns) {
        for (const p of pattern.patterns) collectVariablesFromPattern(p, vars, true)
      }
      break
  }
}

export default class Processor extends QueryAnalyzer {
  private scopeStack: ScopeContext[] = []
  private currentParamTerms: Set<Term> = this.factory.termSet()
  private isAnalyzingBind: boolean = false

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

  constructor(factory: Env, private params: Map<Term, Term | Term[]>, parameters?: Set<Term>, variables?: Set<string>) {
    super(factory, parameters, variables)
  }

  override processPatterns(patterns: sparqljs.Pattern[]): sparqljs.Pattern[] {
    const parentScope = this.scopeStack[this.scopeStack.length - 1]
    const available = new Map<string, ParamBinding>(parentScope?.availableParamBindings)

    const currentScope: ScopeContext = {
      directParams: this.factory.termSet(),
      directUsedVars: new Set<string>(),
      allUsedVars: new Set<string>(),
      definedParamBindings: new Map<string, ParamBinding>(),
      claimedByChild: new Set<string>(),
      availableParamBindings: available,
    }
    this.scopeStack.push(currentScope)

    // Pre-pass: identify all param BIND patterns in this scope
    for (const pattern of patterns) {
      if (pattern.type === 'bind') {
        const bind = pattern as sparqljs.BindPattern
        this.isAnalyzingBind = true
        this.currentParamTerms = this.factory.termSet()
        const processedExpression = this.processExpression(bind.expression)
        const paramTerms = this.currentParamTerms
        this.isAnalyzingBind = false

        if (paramTerms.size > 0) {
          const varName = bind.variable.value
          const processedBind: sparqljs.BindPattern = {
            type: 'bind',
            variable: bind.variable,
            expression: processedExpression,
          }
          const binding: ParamBinding = {
            variableName: varName,
            bindPattern: processedBind,
            paramTerms,
          }
          currentScope.definedParamBindings.set(varName, binding)
          currentScope.availableParamBindings.set(varName, binding)
        }
      }
      else if (pattern.type === 'bgp') {
        for (const triple of pattern.triples) {
          if ('termType' in triple.predicate && this.param.equals(triple.predicate)) {
            const paramTerm = triple.subject.termType === 'Variable' ? triple.object : triple.subject
            const varName = triple.subject.termType === 'Variable' ? triple.subject.value : triple.object.value
            const paramTerms = this.factory.termSet([paramTerm])
            const processedBind = this.processParamTriple(triple) as sparqljs.BindPattern
            const binding: ParamBinding = {
              variableName: varName,
              bindPattern: processedBind,
              paramTerms,
            }
            currentScope.definedParamBindings.set(varName, binding)
            currentScope.availableParamBindings.set(varName, binding)
          }
        }
      }
    }

    // Process all patterns in this scope
    const processedPatterns: sparqljs.Pattern[] = []

    for (const pattern of patterns) {
      if (pattern.type === 'bind' && currentScope.definedParamBindings.has(pattern.variable.value)) {
        continue
      }
      if (pattern.type === 'bgp') {
        const nonParamTriples = pattern.triples.filter(t => !('termType' in t.predicate && this.param.equals(t.predicate)))
        if (nonParamTriples.length === 0) {
          continue
        }
        const bgp: sparqljs.BgpPattern = { type: 'bgp', triples: nonParamTriples }
        const processed = this.processBgp(bgp)
        const processedList = Array.isArray(processed) ? processed : [processed]
        for (const p of processedList) {
          collectVariablesFromPattern(p, currentScope.directUsedVars, false)
          collectVariablesFromPattern(p, currentScope.allUsedVars, false)
          processedPatterns.push(p)
        }
        continue
      }

      const processed = this.processPattern(pattern)
      if (!processed) continue
      const processedList = Array.isArray(processed) ? processed : [processed]
      for (const p of processedList) {
        if (p.type === 'filter' || p.type === 'bind' || p.type === 'values') {
          collectVariablesFromPattern(p, currentScope.directUsedVars, false)
        }
        collectVariablesFromPattern(p, currentScope.allUsedVars, true)
        processedPatterns.push(p)
      }
    }

    // Check which available param bindings from ancestors are claimed by this scope
    const claimedAncestorBinds: sparqljs.BindPattern[] = []
    if (parentScope) {
      for (const [varName, binding] of currentScope.availableParamBindings.entries()) {
        if (!currentScope.definedParamBindings.has(varName)) {
          if (currentScope.allUsedVars.has(varName)) {
            parentScope.claimedByChild.add(varName)
            claimedAncestorBinds.push(binding.bindPattern)
            for (const t of binding.paramTerms) {
              currentScope.directParams.add(t)
            }
          }
        }
      }
    }

    // Decide which definedParamBindings in currentScope to keep
    const keptOwnBinds: sparqljs.BindPattern[] = []
    for (const [varName, binding] of currentScope.definedParamBindings.entries()) {
      const isUsedDirectly = currentScope.directUsedVars.has(varName)
      const isClaimedByChild = currentScope.claimedByChild.has(varName)
      if (isUsedDirectly || !isClaimedByChild) {
        keptOwnBinds.push(binding.bindPattern)
        for (const t of binding.paramTerms) {
          currentScope.directParams.add(t)
        }
      }
    }

    this.scopeStack.pop()

    // Propagate allUsedVars to parent
    if (parentScope) {
      for (const v of currentScope.allUsedVars) {
        parentScope.allUsedVars.add(v)
      }
    }

    const values = this.buildValuesClause(currentScope.directParams)
    const result: sparqljs.Pattern[] = []
    if (values) {
      result.push(values)
    }
    result.push(...claimedAncestorBinds)
    result.push(...keptOwnBinds)
    result.push(...processedPatterns)

    return result
  }

  override processUnion(union: sparqljs.UnionPattern): sparqljs.Pattern {
    return {
      ...union,
      patterns: union.patterns.map((branch) => {
        if (branch.type === 'group' || branch.type === 'graph' || branch.type === 'optional' || branch.type === 'service' || branch.type === 'minus' || branch.type === 'union') {
          return this.processPattern(branch) as sparqljs.Pattern
        }

        const processed = this.processPatterns([branch])
        if (processed.length === 1 && processed[0].type !== 'values') {
          return processed[0]
        }

        return {
          type: 'group',
          patterns: processed,
        }
      }),
    }
  }

  private buildValuesClause(scope: Set<Term>): sparqljs.ValuesPattern | null {
    const values = Object.fromEntries([...scope].flatMap((v) => {
      const valueOrArray = this.params.get(v)
      if (!valueOrArray) return []

      return (Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray])
        .filter(this.isValidValuesValue)
        .map((value) => {
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
    if (this.currentParamTerms) {
      this.currentParamTerms.add(varTerm)
    }
    if (!this.isAnalyzingBind && this.scopeStack.length > 0) {
      this.scopeStack[this.scopeStack.length - 1].directParams.add(varTerm)
    }
    return this.paramVariable(varTerm)
  }

  override processParamTriple(triple: sparqljs.Triple) {
    const paramTerm = triple.subject.termType === 'Variable' ? triple.object : triple.subject
    const varName = triple.subject.termType === 'Variable' ? triple.subject.value : triple.object.value
    const expression = this.params.get(paramTerm)

    if (!expression) {
      throw new Error(`No value provided for parameter ${paramTerm.value}`)
    }

    return <sparqljs.BindPattern>{
      type: 'bind',
      variable: this.factory.variable!(varName),
      expression: this.paramVariable(paramTerm),
    }
  }

  override clone(): Processor {
    return new Processor(this.factory, this.params, this.parameters, this.variables)
  }
}
