### ts-plugin-sparqlc

TypeScript language service plugin that gives rich types for SPARQL query (`.rq`) and update (`.ru`) modules compiled by `sparqlc`.

- Infers the correct executor types for `.rq`/`.ru` imports
- Understands parameter binding maps and result row typings
- Complements runtime integration via `node-loader-sparql` or bundler plugins

This plugin is editor-focused (TypeScript language service).

#### Install

```
npm i -D ts-plugin-sparqlc sparqlc
```

#### Enable in tsconfig

Add the plugin to your `tsconfig.json` under `compilerOptions.plugins`.

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "plugins": [
      { "name": "ts-plugin-sparqlc" }
    ]
  }
}
```

Notes:
- TypeScript applies custom plugins in the editor (tsserver). Some build tools may not load language service plugins during `tsc --noEmit`; rely on your editor for IntelliSense and on runtime/bundler plugins for execution.
- Using `moduleResolution: "Bundler"` (or a compatible setting) generally plays best with non‑JS module types.

#### Usage

With the plugin enabled, importing a SPARQL file provides a typed executor whose return type depends on the `sparql-http-client` you pass at call time:

```ts
import env from '@zazuko/env'
import type { ParsingClient, StreamClient } from 'sparql-http-client'

// SELECT query in a .rq file
const { default: selectFruits } = await import('./queries/select-fruits.rq')

// ParsingClient → array of typed bindings
declare const parsingClient: ParsingClient
const rows = await selectFruits({ env, client: parsingClient })
//    ^? rows: Array<{ /* variables inferred from the query */ }>

// StreamClient → async iterable of bindings
declare const streamClient: StreamClient
for await (const row of selectFruits({ env, client: streamClient })) {
  // row is strongly typed here too
}
```

Update queries (`.ru`) yield an executor that resolves to `void` when invoked with a `ParsingClient`:

```ts
const { default: insertData } = await import('./queries/insert-data.ru')
await insertData({ env, client: parsingClient })
```

#### Base IRI via import attributes (runtime)

At runtime you can pass a base IRI for resolving relative IRIs using ESM import attributes (handled by `node-loader-sparql`). This plugin understands the resulting types regardless of the base you choose:

```ts
const { default: q } = await import('./queries/select-relative-uris.rq', {
  with: { base: 'http://example.org/fruits/' },
})
``;

#### Works with runtime loaders

For executing `.rq`/`.ru` at runtime, pair this plugin with:
- `node-loader-sparql` (Node.js ESM loader; development and server runtimes)
- Project‑specific bundler integrations (e.g., Vite) if you compile queries during build

See also:
- `packages/sparqlc/README.md` — compiler and executors overview
- `packages/node-loader-sparql/README.md` — Node runtime loader and import attributes
