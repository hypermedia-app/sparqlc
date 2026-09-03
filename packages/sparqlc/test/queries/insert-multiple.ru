PREFIX sparqlc: <https://sparqlc.described.at/>
PREFIX ex: <http://example.org/>
PREFIX fruit: <http://example.org/fruits/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
prefix schema: <http://schema.org/>

INSERT DATA {
    fruit:Watermelon
    a fruit:Fruit ;
        rdfs:label "Watermelon" ;
        schema:color "Green" ;
        fruit:hasTaste "Sweet" ;
        fruit:isCrunchy true .
} ;

        DELETE {
    ?res fruit:isCrunchy ?isCrunchy .
}
WHERE {
    BIND(sparqlc:param("type") as ?type)

    ?res a ?type ; 
        fruit:isCrunchy ?isCrunchy .
} ;

        DELETE {
    ?res rdfs:label ?label
}
INSERT {
    ?res rdfs:label ?ucase
}
WHERE {
    BIND(sparqlc:param("type") as ?type)

    ?res a ?type ; 
        rdfs:label ?label.
        BIND(ucase(?label) as ?ucase)
} ;
