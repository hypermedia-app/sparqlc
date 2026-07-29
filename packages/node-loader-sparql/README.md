### node-loader-sparql

Node.js ESM loader that lets you import SPARQL query files (`.rq`) and update files (`.ru`) directly, returning typed executors from the `sparqlc` compiler.

- Resolves and compiles `.rq`/`.ru` on the fly
- Supports ESM import attributes (e.g., `with: { base }`) for relative IRI resolution
- Produces separate module instances per distinct attribute set by encoding attributes in the resolved URL

#### Install

```
npm i -D node-loader-sparql sparqlc
```

#### Enable the loader

Use Node’s ESM loader registration via `--import` (Node 20.6+/22+):

```
node --import node-loader-sparql app.mjs
```

You can also set an environment variable to apply it to all Node runs:

```
export NODE_OPTIONS="--import node-loader-sparql"
```

In test runners such as Mocha, add `node-loader-sparql` to the `require` list. This repo’s packages do this in their `mocha` config.

#### Importing queries

```ts
// Import a SELECT query executor from a .rq file
const { default: selectAll } = await import('./queries/select-all.rq')

// Execute with sparql-http-client
import env from '@zazuko/env'
import type { ParsingClient } from 'sparql-http-client'

const client: ParsingClient = /* ... */
const rows = await selectAll({ env, client })
```

Updates (`.ru`) work the same and return `void` with a `ParsingClient`:

```ts
const { default: insertData } = await import('./queries/insert-data.ru')
await insertData({ env, client })
```

#### Base IRI via import attributes

Pass a base IRI to resolve relative IRIs in your query using ESM import attributes:

```ts
const { default: q } = await import('./queries/select.rq', {
  with: { base: 'http://example.org/' },
})
```

This is parsed by the loader and forwarded to `sparqlc`’s compiler.

#### Separate module instances per attribute set

By design, Node caches loaded modules by their fully resolved URL. This loader incorporates the import attributes into that URL during its `resolve` hook. As a result, different attribute sets map to different URLs and therefore different module instances and cache entries.

```ts
const a = await import('./q.rq', { with: { base: 'http://ex.org/a/' } })
const b = await import('./q.rq', { with: { base: 'http://ex.org/b/' } })

// a.default !== b.default (separate instances compiled with different bases)
```

This approach also guarantees re-importing with the same attributes hits the cache consistently.

#### Notes and caveats

- Only `.rq` and `.ru` files are handled. Other imports are passed through to Node’s default resolver/loader.
- The attribute set is encoded deterministically in the resolved URL’s query string; avoid putting secrets in attributes.
- If you need additional attributes in the future, they will be similarly encoded and isolated per distinct set.
