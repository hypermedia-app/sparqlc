import { compile } from 'sparqlc'

export function sparqlToMetaScript(query: string, endpoint: string) {
    return `import SparqlClient from 'sparql-http-client/ParsingClient.js'
import rdf from '@zazuko/env'    

const client = new SparqlClient({ endpointUrl: '${endpoint}' })
    
const execute = ${compile(query)}

execute(new URLSearchParams(location.search), client, rdf).then(bindings => {
    for(const {name, content} of bindings) {
        if(name.value === 'title') {
            document.title = content.value
        } else {
            const meta = document.createElement('meta')
            meta.name = name.value
            meta.content = content.value
            document.head.appendChild(meta)
        }
    }
})`
}
