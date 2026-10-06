### sparqlc

Typed SPARQL query modules for Node.js and build tools. Write queries in `.rq` (query) and `.ru` (update) files, import them as ESM, and execute against a SPARQL endpoint or in‑memory dataset with strong TypeScript types.

#### Install

```
npm i sparqlc
```

To use `.rq`/`.ru` files directly at runtime in Node.js, install the companion loader:

```
npm i -D node-loader-sparql
```

Then run Node with the loader enabled (Node 20.6+/22+ ESM `--import`):

```
node --import node-loader-sparql your-script.mjs
```

Or set once for your environment:

```
export NODE_OPTIONS="--import node-loader-sparql"
```

In Mocha (or similar test runners) you can also add `node-loader-sparql` to the `require` list, as done in this repo’s tests.

#### Usage

Select queries export an executable function. The return type depends on the client you pass (`sparql-http-client`):

- `StreamClient` → async generator of bindings
- `ParsingClient` → array of bindings (parsed terms)

Construct/Describe queries return an RDF/JS `DatasetCore` with a `ParsingClient`, or a `Stream` with a `StreamClient`.

```ts
// fruits/select-relative-uris.rq
// SELECT ?label WHERE { <fruits/Banana> rdfs:label ?label }

import env from '@zazuko/env'
import { ParsingClient } from 'sparql-http-client'

const { default: selectBanana } = await import('./fruits/select-relative-uris.rq', {
  with: { base: 'http://example.org/' },
})

const client: ParsingClient = /* ... */

const rows = await selectBanana({ env, client })
// → [{ label: env.literal('Banana') }, ...]
```

If you omit `client` from options, the function returns the final serialized SPARQL string instead of executing an HTTP request:

```ts
const sparqlQueryString = await selectBanana({ env })
```

Updates (`.ru`) export an executable function returning `void` when used with a `ParsingClient`:

```ts
const { default: insertData } = await import('./queries/insert-data.ru')

await insertData({ env, client })
```

#### Binding parameters with `sparqlc:param`

Queries can declare variables and placeholders to be bound at execution time using the `sparqlc:param` SPARQL function.

##### Declaring parameters in SPARQL queries

Declare the `sparqlc:` prefix:

```sparql
PREFIX sparqlc: <https://sparqlc.described.at/>
```

You can use `sparqlc:param(...)` in `BIND(...)` expressions, `FILTER(...)` expressions, or anywhere SPARQL expressions are valid:

- **String literal parameter keys**: Identify parameters by string name.
  ```sparql
  # queries/select-by-type.rq
  PREFIX sparqlc: <https://sparqlc.described.at/>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

  SELECT ?res ?label WHERE {
    BIND(sparqlc:param("type") AS ?type)

    ?res a ?type ;
         rdfs:label ?label .
  }
  ```

- **NamedNode / IRI parameter keys**: Identify parameters using full IRIs or prefixed names (such as schema.org terms).
  ```sparql
  # queries/construct-named-node-param.rq
  PREFIX sparqlc: <https://sparqlc.described.at/>
  PREFIX schema: <http://schema.org/>
  PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

  CONSTRUCT {
    ?fruit rdfs:label ?label .
  } WHERE {
    BIND(IRI(sparqlc:param(schema:mainEntity)) AS ?fruit)

    ?fruit rdfs:label ?label .
  }
  ```

- **In `FILTER` expressions**:
  ```sparql
  PREFIX sparqlc: <https://sparqlc.described.at/>

  SELECT ?s ?val WHERE {
    ?s ?p ?val .
    FILTER(?val = sparqlc:param("expected"))
  }
  ```

- **Scoped evaluation**: `sparqlc:param` can be used inside `GRAPH`, `OPTIONAL`, `SERVICE`, `MINUS`, unions, sub-selects, and update operations (`INSERT`, `DELETE`). Parameter values are injected into the query via appropriately scoped `VALUES` clauses according to SPARQL bottom-up evaluation semantics.

##### Passing parameters at execution time

Pass parameter values as the first argument(s) to the imported query function. `sparqlc` supports several formats:

- **Plain object dictionary (`Record<string, Term>`)**:
  ```ts
  import env from '@zazuko/env'
  const { default: selectByType } = await import('./queries/select-by-type.rq')

  const rows = await selectByType(
    { type: env.namedNode('http://example.org/Fruit') },
    { env, client }
  )
  ```

- **RDF/JS `TermMap` / `Map<Term, Term | Term[]>`**: Useful for NamedNode parameter keys and full control over RDF terms.
  ```ts
  import env from '@zazuko/env'
  const { default: construct } = await import('./queries/construct-named-node-param.rq')

  const params = env.termMap([
    [env.ns.schema.mainEntity, env.namedNode('http://example.org/fruits/Banana')],
  ])

  const dataset = await construct(params, { env, client })
  ```

- **`URLSearchParams`**: Useful for query strings.
  ```ts
  const params = new URLSearchParams([['type', 'http://example.org/Fruit']])
  const rows = await selectByType(params, { env, client })
  ```

- **Multiple parameter sources**: Multiple parameter maps or objects can be provided in sequence before the options argument.
  ```ts
  const rows = await selectQuery(params1, params2, { env, client })
  ```

#### Runtime query options

Queries can be modified at execution time using runtime options:

- `distinct`: `boolean` — dynamically add or remove the `DISTINCT` modifier
- `from` / `fromNamed`: `NamedNode | string | (NamedNode | string)[]` — specify default (`FROM`) or named (`FROM NAMED`) graph IRIs
- `limit`: `number` — specify or override `LIMIT`
- `offset`: `number` — specify or override `OFFSET`
- `orderBy`: variable, direction tuple `[variable, 'ASC' | 'DESC']`, or array thereof — sort results with compile-time type checking restricted to variables present in the query
- `processors`: optional array of `@hydrofoil/sparql-processor` instances to transform the parsed query before serialization

```ts
const rows = await selectFruit({
  env,
  client,
  distinct: true,
  limit: 10,
  offset: 20,
  orderBy: [
    ['label', 'DESC'],
    'fruit',
  ],
  from: 'http://example.org/fruits',
  fromNamed: [
    'http://example.org/graphs/fruits-1',
    env.namedNode('http://example.org/graphs/fruits-2'),
  ],
})
```

#### Programmatic API (`compile`)

`sparqlc` provides a `compile` function to compile SPARQL query strings directly in JavaScript or TypeScript:

```ts
import { compile } from 'sparqlc'
import env from '@zazuko/env'
import { ParsingClient } from 'sparql-http-client'

const source = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE { ?s foaf:name ?name }
LIMIT 10
`

const { execute, returnType } = compile(source)
console.log(returnType) // e.g. 'Select'

const client: ParsingClient = /* ... */
const rows = await execute({ env, client })
// Or omit `client` to get the final generated SPARQL query string:
const sparqlString = await execute({ env })
```

#### Base IRI via import attributes

You can pass a base IRI for resolving relative IRIs in the query using ESM import attributes:

```ts
const { default: q } = await import('./queries/select-relative-uris.rq', {
  with: { base: 'http://example.org/fruits/' },
})
```

This mirrors the behavior covered by the test suite and is supported by the `node-loader-sparql` package.

#### Separate module instances per attribute set

When using the `node-loader-sparql` runtime loader, each distinct set of import attributes (e.g., a different `base`) resolves to a distinct module URL. That means imports with different `with` values produce separate module instances and cache entries:

```ts
const a = await import('./q.rq', { with: { base: 'http://ex.org/a/' } })
const b = await import('./q.rq', { with: { base: 'http://ex.org/b/' } })

// a.default and b.default are separate compiled modules configured with different base IRIs
```

This is implemented in the loader’s `resolve` hook by incorporating the attributes into the resolved URL, ensuring Node’s module map keys them separately.

#### Type hints

`sparqlc` ships TypeScript declarations for the executors:

- `ExecuteSelect<TBindings>`
- `ExecuteConstruct`
- `ExecuteAsk`
- `ExecuteUpdate`

See `packages/sparqlc/test/index.test.ts` for end‑to‑end examples that match the types above.
