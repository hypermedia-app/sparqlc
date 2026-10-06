---
"sparqlc": patch
"ts-plugin-sparqlc": patch
"sparqlc-cli": minor
---

Add `sparqlc-cli` package containing `sparqlc-tsc` (a drop-in `tsc` replacement for SPARQL query/update imports) and `sparqlc` (a CLI SPARQL compiler).
Extract shared declaration generator `toDeclaration` into `sparqlc/declarations.js` and update `ts-plugin-sparqlc` to use it.
