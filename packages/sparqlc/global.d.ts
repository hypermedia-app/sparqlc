declare module '*.rq' {
  import type { Params, ExecuteOptions } from 'sparqlc'
  declare function execute(...params: [...Params[], ExecuteOptions<C>]): C extends undefined ? Promise<string> : Promise<any>
  export default _default
}
