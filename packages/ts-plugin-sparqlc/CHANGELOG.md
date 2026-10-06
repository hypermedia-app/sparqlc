# ts-plugin-sparqlc

## 0.1.5

### Patch Changes

- 2885ca4: Add `sparqlc-cli` package containing `sparqlc-tsc` (a drop-in `tsc` replacement for SPARQL query/update imports) and `sparqlc` (a CLI SPARQL compiler).
  Extract shared declaration generator `toDeclaration` into `sparqlc/declarations.js` and update `ts-plugin-sparqlc` to use it.
- Updated dependencies [2885ca4]
- Updated dependencies [2885ca4]
  - sparqlc@0.3.0

## 0.1.4

### Patch Changes

- Updated dependencies [44c09b9]
- Updated dependencies [d0a2b76]
  - sparqlc@0.2.0

## 0.1.3

### Patch Changes

- 7739d41: Mention `sparqlc` types loading when using the plugin
- Updated dependencies [96222d5]
  - sparqlc@0.1.7

## 0.1.2

### Patch Changes

- 0694c6b: Also handle `.ru` files
- cf9c360: Type provider would fail when the query used relative URLs without `BASE`
- Updated dependencies [ccfe1e2]
  - sparqlc@0.1.5

## 0.1.1

### Patch Changes

- b0dd12d: When query is `SELECT`, export the bindings type
- Updated dependencies [9e003ac]
- Updated dependencies [87f6a52]
- Updated dependencies [c61b5d0]
  - sparqlc@0.1.1

## 0.1.0

### Minor Changes

- 41b20a0: First version

### Patch Changes

- Updated dependencies [41b20a0]
  - sparqlc@0.1.0
