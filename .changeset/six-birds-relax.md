---
"sparqlc": patch
---

`VALUES` clause containing values of `sparqlc:param` are now injected inside nested groups or `GRAPH` clauese to acommodate for SPARQL's bottom-up evaluation semantics
