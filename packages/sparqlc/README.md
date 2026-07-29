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

Updates (`.ru`) export an executable function returning `void` when used with a `ParsingClient`:

```ts
const { default: insertData } = await import('./queries/insert-data.ru')

await insertData({ env, client })
```

#### Binding parameters

Queries can declare variables to be bound at execution time. Provide a map of RDF terms as the first argument. Keys may be full variable names or well‑known IRIs (helpful with `@zazuko/env`).

```ts
const params = env.termMap([
  [env.ns.schema.mainEntity, env.namedNode('http://example.org/fruits/Banana')],
])

const { default: construct } = await import('./queries/construct-named-node-param.rq')
const dataset = await construct(params, { env, client })
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
