---
name: node-loader-sparql
description: Configure Node.js runtime imports of SPARQL query and update modules. Use when enabling node-loader-sparql, resolving relative IRIs, or diagnosing .rq and .ru runtime loading.
---

# Node.js SPARQL loader

Install `node-loader-sparql` and `sparqlc` in the consuming project. The loader depends on `sparqlc`, but generated executors import `sparqlc/*` from the query module location. npm hoisting can make the transitive dependency sufficient in an existing application; a direct dependency makes that resolution reliable under isolated dependency layouts and also supports application imports of sparqlc APIs, types, or fallback declarations. Check the actual resolution before attributing a runtime failure solely to a missing direct entry. Use Node.js 24 or newer, matching the package engine requirement.

Register the loader before importing queries:

```sh
node --import node-loader-sparql app.mjs
```

For a test runner or subprocess workflow, apply the same registration through `NODE_OPTIONS="--import node-loader-sparql"`. In Mocha configuration, the loader can be included in `require`.

Alternatively, register the loader dynamically from application code, then dynamically import query modules:

```ts
await import('node-loader-sparql')
const { default: findAll } = await import('./queries/find-all.rq')
```

Await loader registration before importing queries. Static query imports in the same module are resolved before its body runs, so use dynamic query imports with this approach.

```ts
import env from '@zazuko/env'
import findAll from './queries/find-all.rq'

const text = await findAll({ env })
```

The default export is a sparqlc executor. Pass `{ env, client }` to execute against a SPARQL client; omit `client` to inspect serialized SPARQL without making a request. Updates use `.ru` and the same calling convention.

## Resolve relative IRIs

Use import attributes for a compile-time base:

```ts
const { default: query } = await import('./queries/relative.rq', {
  with: { base: 'http://example.org/' },
})
```

Import attributes are encoded in the resolved URL. Distinct attribute sets create distinct module instances; repeated identical attributes reuse the cache. Keep secrets out of attributes because they appear in URLs.

The loader handles `.rq` and `.ru`; unrelated extensions pass through Node's loader chain. For missing runtime imports, check registration and emitted query files. For missing TypeScript types, configure `ts-plugin-sparqlc` in the editor or use `sparqlc-tsc` from `sparqlc-cli` for builds; runtime registration alone does not supply inferred declarations.
