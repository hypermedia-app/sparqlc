# sparqlc

Typed SPARQL query modules for TypeScript and JavaScript across Node.js, Vite, and esbuild.

Write SPARQL queries in `.rq` (query) and `.ru` (update) files, import them directly as ECMAScript modules, and execute them with strong types against a SPARQL endpoint or RDF/JS dataset.

## Packages

- **[`sparqlc`](./packages/sparqlc)** – Core compiler and runtime library (JS API, query analysis, parameter binding).
- **[`sparqlc-cli`](./packages/sparqlc-cli)** – CLI tools: `sparqlc-tsc` (a drop-in replacement for `tsc` that type-checks `.rq`/`.ru` imports and copies assets) and `sparqlc` (standalone query compiler).
- **[`node-loader-sparql`](./packages/node-loader-sparql)** – Node.js ESM loader to import `.rq`/`.ru` files directly at runtime.
- **[`vite-plugin-sparql`](./packages/vite-plugin-sparql)** – Vite plugin for importing and bundling SPARQL queries in web applications.
- **[`esbuild-plugin-sparql`](./packages/esbuild-plugin-sparql)** – esbuild plugin to bundle SPARQL queries.
- **[`ts-plugin-sparqlc`](./packages/ts-plugin-sparqlc)** – TypeScript language service plugin providing editor type inference and autocomplete for `.rq`/`.ru` imports.

## Quick Start

### 1. Install

Install the integration appropriate for your environment:

```sh
# For Node.js runtime imports:
npm i -D node-loader-sparql

# For Vite:
npm i -D vite-plugin-sparql

# For esbuild:
npm i -D esbuild-plugin-sparql

# For TypeScript IDE support:
npm i -D ts-plugin-sparqlc

# For command-line type-checking and builds:
npm i -D sparqlc-cli
```

### 2. Write a Query

```sparql
# queries/find-fruits.rq
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX sparqlc: <https://sparqlc.described.at/>

SELECT ?fruit ?label WHERE {
  BIND(sparqlc:param("category") AS ?category)

  ?fruit a ?category ;
         rdfs:label ?label .
}
```

### 3. Import and Execute

```ts
import env from '@zazuko/env'
import { ParsingClient } from 'sparql-http-client'
import findFruits from './queries/find-fruits.rq'

const client = new ParsingClient({ endpointUrl: 'https://example.org/sparql' })

const rows = await findFruits(
  { category: env.namedNode('http://example.org/Fruit') },
  { env, client }
)

for (const row of rows) {
  console.log(row.fruit.value, row.label.value)
}
```

## Documentation

For detailed guides, configuration options, and API documentation, refer to the individual packages:

- [Core compiler and runtime (`sparqlc`)](./packages/sparqlc/README.md)
- [CLI utilities and `sparqlc-tsc` (`sparqlc-cli`)](./packages/sparqlc-cli/README.md)
- [Node.js ESM loader (`node-loader-sparql`)](./packages/node-loader-sparql/README.md)
- [Vite plugin (`vite-plugin-sparql`)](./packages/vite-plugin-sparql/README.md)
- [esbuild plugin (`esbuild-plugin-sparql`)](./packages/esbuild-plugin-sparql/README.md)
- [TypeScript language service plugin (`ts-plugin-sparqlc`)](./packages/ts-plugin-sparqlc/README.md)

## License

MIT © Tomasz Pluskiewicz
