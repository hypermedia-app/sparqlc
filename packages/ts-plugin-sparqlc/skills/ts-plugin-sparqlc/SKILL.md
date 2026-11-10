---
name: ts-plugin-sparqlc
description: Enable query-specific TypeScript editor inference for SPARQL imports. Use when configuring ts-plugin-sparqlc or diagnosing .rq and .ru IntelliSense in TypeScript language services.
---

# SPARQL editor types

Install `ts-plugin-sparqlc` as a development dependency and `sparqlc` as an application dependency. The plugin depends on sparqlc, so npm may already hoist a usable copy; direct installation provides reliable resolution for generated executors and their type imports from the application's query module location, including isolated dependency layouts. It also supports explicit sparqlc API/type imports and generic fallback declarations. Add the plugin to the existing tsconfig without replacing other compiler options or plugins:

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "plugins": [{ "name": "ts-plugin-sparqlc" }]
  }
}
```

Use module resolution compatible with the project (`Bundler` for bundled applications or `NodeNext` for Node ESM). Ensure the editor uses the project's TypeScript installation, then reload its language service after changing plugin configuration.

Import `.rq` and `.ru` files normally. The plugin generates virtual `foo.d.rq.ts` and `foo.d.ru.ts` declarations from their contents, including executor types, parameter information, and result bindings. These declarations are held in memory; do not create placeholder declarations that hide query-specific inference.

## Separate editor, build, and runtime support

Language service plugins supply editor types. Plain `tsc` does not load this plugin. Use `sparqlc-tsc` from `sparqlc-cli` when command-line builds or CI need inferred query types and query asset copying.

If only generic fallback declarations are desired, expose the `sparqlc` types through `compilerOptions.types` or a triple-slash type reference. Generic fallback declarations do not provide query-specific inference.

A successful bundler build does not establish that the editor plugin loaded or that TypeScript semantic checks passed. Keep the application's lint, build, and type-check results separate; report dependency declaration failures separately from query inference errors.

Execution requires `node-loader-sparql` or a bundler integration such as `vite-plugin-sparql` or `esbuild-plugin-sparql`. Type inference alone does not transform or load query files.

When inference fails, first check that the editor loaded the plugin, the import points to a real `.rq` or `.ru` file, and the SPARQL parses. The plugin returns an empty module declaration on compilation failure, so missing exports can indicate invalid SPARQL. Runtime base IRIs are configured in the loader or bundler independently of editor inference.
