# sparqlc-cli

CLI utilities for `sparqlc`:
- **`sparqlc-tsc`**: A drop-in `tsc` replacement that provides type-checking and emit support for `.rq` and `.ru` SPARQL imports compiled with `sparqlc`.
- **`sparqlc`**: A standalone command-line compiler to compile a SPARQL query/update file to JavaScript module code and output to stdout.

## Installation

```bash
npm install --save-dev sparqlc-cli sparqlc typescript
```

---

## `sparqlc-tsc`

### Background

While [`ts-plugin-sparqlc`](https://github.com/hypermedia-app/sparqlc/tree/master/packages/ts-plugin-sparqlc) provides rich types in IDE editors via TypeScript Language Service plugins, plain `tsc` on the command line does not load language service plugins. As a result, command-line builds and CI runs fall back to untyped generic declarations or fail with implicit-any errors.

`sparqlc-tsc` wraps TypeScript's CLI entry point with a custom virtual file system that serves generated declaration files (`foo.d.rq.ts` / `foo.d.ru.ts`) from memory and copies `.rq` and `.ru` files to `outDir` when emitting JavaScript.

### Peer Dependency Notice

`sparqlc-tsc` relies on TypeScript 5.x or 6.x. It interfaces with TypeScript's CLI via `ts.executeCommandLine` and `program.getCommonSourceDirectory()`, which are available on the `ts` namespace in TypeScript 5 and 6.

### Configuration

In your `tsconfig.json`, enable `allowArbitraryExtensions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowArbitraryExtensions": true
  }
}
```

`allowArbitraryExtensions` is required for TypeScript to look up virtual `foo.d.rq.ts` / `foo.d.ru.ts` declarations for `./foo.rq` / `./foo.ru` imports.

### Usage

Use `sparqlc-tsc` anywhere you would use `tsc`:

```json
{
  "scripts": {
    "build": "sparqlc-tsc",
    "typecheck": "sparqlc-tsc --noEmit",
    "watch": "sparqlc-tsc --watch"
  }
}
```

All standard `tsc` flags, project references (`-b`), incremental builds, and `--watch` are fully supported.

### Query Copying

When emitting JavaScript with `outDir`, `sparqlc-tsc` copies all `.rq` and `.ru` files referenced by your TypeScript program to `outDir`, mirroring the directory structure of the emitted JavaScript files.

- Unchanged queries are skipped on incremental builds.
- When `--listEmittedFiles` is passed, copied queries are logged with `TSFILE: ...`.
- No copies are performed under `--noEmit`, `--emitDeclarationOnly`, or `noEmitOnError` with diagnostics errors.

### Limitations

- **Statically analysable imports only:** Only queries referenced through statically analysable imports (e.g. `import q from './query.rq'` or `import('./query.rq')` with string literals) are tracked and copied. Dynamic expressions such as ``import(`./queries/${name}.rq`)`` are not copied automatically.
- **`tsc -b --clean`:** TypeScript's clean command does not track or remove copied `.rq` / `.ru` asset files from `outDir`.
- **`outFile` unsupported:** Bundle output via `outFile` is not supported for query file copying; `outDir` must be used.
- **TypeScript internal coupling:** `sparqlc-tsc` hooks into TypeScript's CLI mechanisms (`ts.executeCommandLine`, `ts.sys`, and `program.getCommonSourceDirectory`).

---

## `sparqlc`

A command-line compiler for compiling individual SPARQL queries and updates into JavaScript module source code.

### Usage

```bash
sparqlc path/to/query.rq
```

Pass `-b` or `--base <iri>` to specify a base IRI for resolving relative IRIs:

```bash
sparqlc --base http://example.org/api/ path/to/query.rq > dist/query.js
```
