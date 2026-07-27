PREFIX sparqlc: <https://sparqlc.described.at/>
PREFIX ex: <http://example.org/>

WITH ex:g
INSERT {
  ?foo ex:bar ?baz .
} WHERE {
  BIND(sparqlc:param("foo") as ?foo)
  BIND(ucase(sparqlc:param("baz")) as ?baz)
}
