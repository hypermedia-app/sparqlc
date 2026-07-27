PREFIX sparqlc: <https://sparqlc.described.at/>
PREFIX ex: <http://example.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

DELETE {
  ?res rdfs:label ?label
}
INSERT {
  ?res rdfs:label ?ucase
}
WHERE {
  BIND(sparqlc:param("type") as ?type)

  ?res a ?type; rdfs:label ?label.
  BIND(ucase(?label) as ?ucase)
}
