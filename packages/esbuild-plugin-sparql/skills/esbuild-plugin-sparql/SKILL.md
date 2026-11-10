---
name: esbuild-plugin-sparql
description: Bundle SPARQL query and update imports with esbuild-plugin-sparql. Use when configuring esbuild to transform .rq or .ru modules or setting a query base IRI.
---

# esbuild SPARQL integration

Install `esbuild-plugin-sparql`, `sparqlc`, and `esbuild` in the consuming project.

The default export is a plugin object. Add it directly to esbuild's plugin list:

```ts
import esbuild from 'esbuild'
import sparql from 'esbuild-plugin-sparql'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  plugins: [sparql],
})
```

Import `.rq` and `.ru` files as default executors. Compilation happens while bundling; execution still needs the sparqlc runtime and an RDF/JS environment.

```ts
import env from '@zazuko/env'
import query from './queries/find-all.rq'

const text = await query({ env })
```

Omitting `client` serializes SPARQL without an endpoint request. Pass `{ env, client }` to execute it.

## Base IRIs and verification

For queries with relative IRIs, pass a URL-encoded `base` search parameter on the import:

```ts
import query from './queries/relative.rq?base=http%3A%2F%2Fexample.org%2F'
```

The plugin resolves query files relative to the importing module and compiles them in its `sparql` namespace. Check both `.rq` and `.ru` imports in a bundle when changing integration code. Node import attributes belong to `node-loader-sparql`; this plugin reads the import's search parameters instead.

For inferred editor types, add `ts-plugin-sparqlc`. Plain TypeScript does not load language service plugins during builds; use `sparqlc-cli` when CLI type checking needs query-specific declarations.
