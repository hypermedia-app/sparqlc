import { compile } from 'sparqlc'

export function sparqlToMetaScript(query: string, endpoint: string) {
    return `import SparqlClient from 'sparql-http-client/ParsingClient.js'
const client = new SparqlClient({ endpointUrl: '${endpoint}' })
    
const execute = ${compile(query)}

execute(client, new URLSearchParams(location.search)).then(bindings => {
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
