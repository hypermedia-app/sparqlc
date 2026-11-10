---
name: vite-plugin-sparql
description: Configure Vite to transform SPARQL query and update modules with vite-plugin-sparql. Use when importing .rq or .ru files in Vite applications or configuring base IRIs.
---

# Vite SPARQL integration

Install `vite-plugin-sparql` and `sparqlc` in the consuming Vite project. The package supports Vite 6 or newer.

The default export is a Vite plugin object, so pass it directly without calling it:

```ts
import { defineConfig } from 'vite'
import sparql from 'vite-plugin-sparql'

export default defineConfig({
  plugins: [sparql],
})
```

The plugin runs as a pre-transform for `.rq` and `.ru` files in development and production builds. Import the default executor:

```ts
import env from '@zazuko/env'
import query from './queries/find-all.rq'

const text = await query({ env })
```

Omit `client` to inspect serialized SPARQL without an HTTP request. Pass `{ env, client }` for endpoint execution.

## Relative IRIs and types

Set the compile-time base through a URL-encoded search parameter:

```ts
import query from './queries/relative.rq?base=http%3A%2F%2Fexample.org%2F'
```

Other Vite search parameters may coexist with `base`. The transform checks the URL pathname for the SPARQL extension. Use the Node loader for runtime import attributes such as `with: { base }`.

The Vite plugin handles transformation, while `ts-plugin-sparqlc` supplies editor inference and `sparqlc-cli` supplies query-aware command-line type checking. When diagnosing an integration, check a query import in both the dev server and the production build, and keep typing failures separate from transform failures.
