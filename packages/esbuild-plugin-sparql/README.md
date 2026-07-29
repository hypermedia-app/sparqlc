### esbuild-plugin-sparql

esbuild plugin to compile SPARQL `.rq` (query) and `.ru` (update) files with `sparqlc` during bundling.

- Transforms `.rq`/`.ru` into ESM modules
- Optional `?base=` query to resolve relative IRIs

#### Install

```
npm i -D esbuild-plugin-sparql sparqlc esbuild
```

#### Usage

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

Import queries normally:

```ts
const { default: selectAll } = await import('./queries/select-all.rq')
```

Or pass a base IRI to resolve relative IRIs:

```ts
const { default: q } = await import('./queries/select-relative.rq?base=http%3A%2F%2Fexample.org%2F')
```

Notes:
- The plugin handles both `.rq` and `.ru`.
- For Node.js runtime without bundling and support for import attributes (`with: { base }`), use `node-loader-sparql`.
