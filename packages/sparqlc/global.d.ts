declare module '*.rq' {
  import type { Client } from 'sparql-http-client'
  import type { Term } from '@rdfjs/types'
  import type { Params, Options } from 'sparqlc'
  export type Bindings = Record<string, Term>
  export default function execute<C extends Client | undefined = Client>(...params: [...Params[], Options<C>]): C extends undefined ? Promise<string> : Promise<any>
}

declare module '*.ru' {
  import type { Client } from 'sparql-http-client'
  import type { Params, Options } from 'sparqlc'
  export default function execute<C extends Client | undefined = Client>(...params: [...Params[], Options<C>]): Promise<void>
}
