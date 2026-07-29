### vite-plugin-sparql

Vite plugin that compiles SPARQL `.rq` (query) and `.ru` (update) files with `sparqlc`, so you can import them like regular modules.

- Transforms `.rq`/`.ru` to ESM at build/dev time
- Optional `?base=` query to resolve relative IRIs
- Works in dev server and build

#### Install

```
npm i -D vite-plugin-sparql sparqlc
```

#### Usage

vite.config.ts:

```ts
import { defineConfig } from 'vite'
import sparql from 'vite-plugin-sparql'

export default defineConfig({
  plugins: [sparql()],
})
```

Import a query and execute it with `sparql-http-client`:

```ts
import env from '@zazuko/env'
import type { ParsingClient } from 'sparql-http-client'

const { default: selectAll } = await import('./queries/select-all.rq')

declare const client: ParsingClient
const rows = await selectAll({ env, client })
```

Pass a base IRI via query parameter to resolve relative IRIs in the file:

```ts
const { default: q } = await import('./queries/select-relative.rq?base=http%3A%2F%2Fexample.org%2F')
```

Notes:
- The plugin recognizes both `.rq` and `.ru` extensions.
- For runtime import attributes in Node.js (`with: { base }`), use the companion loader `node-loader-sparql` instead.
