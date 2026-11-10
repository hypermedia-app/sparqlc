---
name: sparqlc
description: Write parameterized SPARQL query modules and consume typed executors with sparqlc. Use when authoring .rq or .ru files, binding RDF terms, or compiling SPARQL to JavaScript.
---

# SPARQL query modules

Keep queries in `.rq` files and updates in `.ru` files. Use a runtime loader or bundler integration to import their default executor.

## Bind parameters

Declare placeholders with the exact namespace below; pass RDF/JS terms instead of interpolating user input into query strings.

```sparql
PREFIX sparqlc: <https://sparqlc.described.at/>
SELECT ?subject WHERE {
  BIND(sparqlc:param("type") AS ?type)
  ?subject a ?type .
}
```

```ts
import env from '@zazuko/env'
import findByType from './find-by-type.rq'

const query = await findByType(
  { type: env.namedNode('http://example.org/Fruit') },
  { env },
)
```

The final argument is always options, including `env`. With no `client`, the executor resolves to the serialized query string, which is useful for checking bindings without HTTP requests. With a `ParsingClient`, SELECT resolves to binding rows, CONSTRUCT/DESCRIBE to a dataset, ASK to a boolean, and updates to void. With a `StreamClient`, await the SELECT executor before iterating its async generator.

String keys in parameter objects identify literal parameter names. For IRI parameter keys, use an RDF/JS term map. `URLSearchParams` values become literals, so use `env.namedNode` when an IRI value is required.

## Compile or configure execution

`compile(source, { base })` from `sparqlc` returns generated ESM in `.code` and a `.returnType`. Write or load the generated module to obtain its default executor; the compiler result's `.execute` is currently a placeholder that throws.

Apply pagination and ordering through executor options such as `limit`, `offset`, `distinct`, `orderBy`, `from`, and `fromNamed`. Keep runtime loading, editor types, and command-line type checking distinct: use `node-loader-sparql` or a bundler for loading, `ts-plugin-sparqlc` for editor inference, and `sparqlc-cli` for typed CLI builds.
