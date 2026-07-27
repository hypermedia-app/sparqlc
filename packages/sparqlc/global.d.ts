declare module '*.rq' {
  import type { Client } from 'sparql-http-client'
  import type { Term } from '@rdfjs/types'
  import type { Params, ExecuteOptions } from 'sparqlc'
  export type Bindings = Record<string, Term>
  export default function execute<C extends Client | undefined = Client>(...params: [...Params[], ExecuteOptions<C>]): C extends undefined ? Promise<string> : Promise<any>
}

declare module '*.ru' {
  import type { Client } from 'sparql-http-client'
  import type { Params, ExecuteOptions } from 'sparqlc'
  export default function execute<C extends Client | undefined = Client>(...params: [...Params[], ExecuteOptions<C>]): Promise<void>
}
