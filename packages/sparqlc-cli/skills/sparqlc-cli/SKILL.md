---
name: sparqlc-cli
description: Type-check and build TypeScript projects with SPARQL imports or compile individual queries. Use when configuring sparqlc-tsc, copying query assets, or running the sparqlc command.
---

# SPARQL compiler commands

Install `sparqlc-cli`, `sparqlc`, and TypeScript 5 or 6 in the consuming project.

## TypeScript projects

Use `sparqlc-tsc` in place of `tsc` for query-aware command-line builds:

```json
{
  "scripts": {
    "build": "sparqlc-tsc",
    "typecheck": "sparqlc-tsc --noEmit",
    "watch": "sparqlc-tsc --watch"
  }
}
```

Enable `compilerOptions.allowArbitraryExtensions` in the project's tsconfig and preserve its existing module settings. A Node ESM project can use `module` and `moduleResolution` set to `NodeNext`.

The wrapper serves virtual `foo.d.rq.ts` / `foo.d.ru.ts` declarations from query sources. Unlike plain `tsc`, it can infer query-specific types without loading an editor language service plugin.

When JavaScript is emitted to `outDir`, statically imported `.rq` and `.ru` files are copied alongside the output, preserving their paths. Runtime Node imports still require registration of `node-loader-sparql`.

Query copying skips `--noEmit`, `--emitDeclarationOnly`, and failed builds under `noEmitOnError`. Computed dynamic imports are not tracked. `outFile` is unsupported for query copying, and `-b --clean` does not remove copied query assets. Use `--listEmittedFiles` to inspect copied paths.

## Individual query compilation

```sh
npx sparqlc --base http://example.org/ queries/find-all.rq > dist/find-all.js
```

The command writes generated JavaScript module source to stdout. Ensure the destination directory exists before redirecting output. `.ru` update files use the same command. Import the generated module's default export as a sparqlc executor; compilation itself does not execute the query.
