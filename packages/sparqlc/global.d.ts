declare module '*.rq' {
  import type { Params, ExecuteOptions } from 'sparqlc'
  export type Bindings = Record<string, Term>
  declare function execute(...params: [...Params[], ExecuteOptions<C>]): C extends undefined ? Promise<string> : Promise<any>
  export default _default
}
