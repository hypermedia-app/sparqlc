# sparqlc monorepo

A set of tools for compiling and using SPARQL queries as first‑class modules across Node.js, Vite, esbuild, and TypeScript.

Packages (in usage order):
- `sparqlc` – core compiler and runtime (JS API + CLI)
- `node-loader-sparql` – Node.js loader to import `.rq` files directly
- `vite-plugin-sparql` – Vite plugin to import `.rq` in web apps
- `esbuild-plugin-sparql` – esbuild plugin to import `.rq`
- `ts-plugin-sparqlc` – TypeScript language service plugin to get strong types for `.rq` imports

## Installation

In most projects you do not install `sparqlc` directly. Instead, add the high‑level integration you use — it will pull `sparqlc` as a dependency:

- Node.js (import `.rq` in Node):
  ```sh
  npm i -D node-loader-sparql
  ```
- Vite (web apps):
  ```sh
  npm i -D vite-plugin-sparql
  ```
- esbuild:
  ```sh
  npm i -D esbuild-plugin-sparql
  ```
- TypeScript editor types for `.rq` imports:
  ```sh
  npm i -D ts-plugin-sparqlc
  ```

Only install `sparqlc` itself if you want to call the core API or use the CLI directly:

```sh
npm i sparqlc
```

Below you’ll find usage for each package.

---

## 1) `sparqlc` (core)

`sparqlc` compiles a SPARQL string into a small executable function with:
- `module` – the emitted JS module which default-exports a function to execute the query
- `returnType` – inferred SPARQL result kind: `Select | Construct | Ask | Update | unknown`
- `execute` – a function that, when given parameters and an executor `{ env, client, processors }`, will either:
  - return a SPARQL string (when no `client` is provided), or
  - execute the query using `sparql-http-client` and return typed results based on `returnType`

### API usage

```ts
import { compile } from 'sparqlc'
import env from '@zazuko/env'
import { StreamClient } from 'sparql-http-client'

const source = `
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE { ?s foaf:name ?name }
LIMIT 10
`

const { execute, returnType } = compile(source)
console.log(returnType) // e.g. 'Select'

// Build executor options
const client = new StreamClient({ endpointUrl: 'https://dbpedia.org/sparql' })

// Optional parameterization examples (URLSearchParams, object, or Map<Term, Term|Term[]>)
const params = { name: env.literal('Alice') }

// Execute:
const rows = await execute(params, { env, client })
// If you omit `client`, execute(...) returns the final SPARQL string instead
```

### Reference parameters with `sparqlc:param`

You can declare and consume query parameters inside `.rq` files using the RDF property/function identified by `https://sparqlc.described.at/param` (IRI). Use a prefix for convenience:

```sparql
PREFIX sparqlc: <https://sparqlc.described.at/>
```

- (Recommended) Function style: `sparqlc:param("name")`
  - Can be easily inlined in `BIND`, `FILTER`, or anywhere an expression is allowed.
  - Example:
    ```sparql
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX sparqlc: <https://sparqlc.described.at/>
    
    SELECT ?name ?age WHERE {
      ?s foaf:name ?name ; foaf:age ?age .
      FILTER (?age >= sparqlc:param("minAge"))
    }
    ```

- Pattern style: `?variable sparqlc:param "name" .`
  - This binds the value of the parameter `"name"` to the SPARQL variable `?variable`.
  - Example:
    ```sparql
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX sparqlc: <https://sparqlc.described.at/>
    
    SELECT ?person WHERE {
      ?name sparqlc:param "person" .  
    
      ?person a foaf:Person ;
              foaf:name ?name .
    }
    ```
    Runtime call:
    ```ts
    import env from '@zazuko/env'
    const rows = await execute({ person: env.namedNode('http://example.com/alice') }, { env, client })
    ```

Passing parameters at runtime
- You may pass parameters as:
  - `Record<string, Term>`: `{ person: env.namedNode('...'), minAge: env.literal('18', xsdInteger) }`
  - `URLSearchParams`: `new URLSearchParams([["person", "http://example.com/alice"], ["minAge", "18"]])` (simple string values)
  - `Map<Term, Term | Term[]>` for full control
- Values are RDFJS `Term`s. For typed literals, construct them via your RDF environment (e.g., `@zazuko/env`).

Notes
- The parameter IRI is exactly `https://sparqlc.described.at/param`.
- Use `PREFIX sparqlc: <https://sparqlc.described.at/>` so `sparqlc:param` expands to that IRI in both triple and function forms.
- Arrays (`Term[]`) are supported by the runtime API for positions that accept multiple terms (e.g., via custom processors). Your usage may vary depending on processors you apply.

### CLI usage

`sparqlc` also ships a tiny CLI wrapper that can be used to process a query and print the effective query:

```sh
npx sparqlc file.rq [param1=value1 param2=value2 ...]
```

Parameter values are string parsed using [rdf-string](https://npm.im/rdf-string).

Typical pattern is to use the library API in your build tool via the plugins below; the CLI is primarily for local debugging.

---

## 2) `node-loader-sparql`

Import `.rq` files directly in Node.js. The loader compiles the query on‑the‑fly and makes the default export be the executable query function (typed at runtime) compatible with `sparqlc`’s `execute` signature.

### Run with Node’s loader flag

```sh
node --experimental-loader=node-loader-sparql ./app.mjs
# Node 22+ keeps the loader flag; ES module specifiers are supported
```

Now you can do:

```ts
// app.mjs (or .ts with tsx/ts-node)
import query from './queries/find-people.rq'
import rdf from '@zazuko/env'
import { StreamClient } from 'sparql-http-client'

const env = rdf
const client = new StreamClient({ endpointUrl: 'https://dbpedia.org/sparql' })

const rows = await query({ env, client })
console.log(rows)
```

---

## 3) `vite-plugin-sparql`

Use `.rq` files seamlessly in Vite projects. The plugin compiles the query at transform time.

### Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import sparql from 'vite-plugin-sparql'

export default defineConfig({
  plugins: [sparql],
})
```

### Usage in app code

```ts
import query from './queries/people.rq'
import rdf from '@zazuko/env'
import { StreamClient } from 'sparql-http-client'

const env = rdf
const client = new StreamClient({ endpointUrl: '/sparql' })

const data = await query({ env, client })
```

---

## 4) `esbuild-plugin-sparql`

Add support for importing `.rq` in esbuild builds.

### Minimal build script

```ts
// build.ts
import { build } from 'esbuild'
import sparql from 'esbuild-plugin-sparql'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [sparql],
})
```

Then in your sources:

```ts
import query from './queries/people.rq'
// … use query.execute({ env, client })
```

If you’re bundling for Node ESM and also using `require()` somewhere, you may need to add a `banner` to create a `require` shim (see the repo tests for an example).

---

## 5) `ts-plugin-sparqlc`

TypeScript language service plugin that gives proper types for `.rq` default exports based on the query’s `returnType`. That means you’ll get:
- Autocomplete/typed signatures for `execute`
- Distinct return types for `Select`, `Construct`, `Ask`, and `Update`

### Configure `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    // Let TS consider non‑TS imports so the plugin can attach types
    "allowArbitraryExtensions": true,

    // Enable the plugin
    "plugins": [
      { "name": "ts-plugin-sparqlc" }
    ]
  }
}
```

### What you get in TS

```ts
import query from './queries/people.rq'

// Hovering shows: ExecuteSelect | ExecuteConstruct | ... depending on the query
const result = await query({ env, client })
```

The plugin internally generates virtual `.d.rq.ts` type stubs next to your `.rq` files and keeps them in sync with your editor session—no files are written to disk.

---

## Runtime expectations

All environments ultimately call `query.execute(..., { env, client, processors? })` produced by `sparqlc`.
- `env`: an RDF/JS environment (e.g. `@zazuko/env`)
- `client`: optional `sparql-http-client` client; when omitted, `execute` returns the final SPARQL string instead of performing a request
- `processors`: optional array of `@hydrofoil/sparql-processor` instances to transform the parsed query before serialization

## Examples

A typical `.rq` file:

```sparql
# queries/people.rq
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE { ?s foaf:name ?name }
LIMIT 5
```

And consuming it (works with the loader/plugins):

```ts
import query from './queries/people.rq'
import rdf from '@zazuko/env'
import { StreamClient } from 'sparql-http-client'

const env = rdf
const client = new StreamClient({ endpointUrl: 'https://dbpedia.org/sparql' })

const rows = await query.execute({ env, client })
```

---

## License

MIT © Tomasz Pluskiewicz
