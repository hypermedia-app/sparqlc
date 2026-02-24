import { ParsingClient } from 'sparql-http-client'
import env from '@zazuko/env/web.js'
import query from './HelloWorld.rq'

export default async function HelloWorld(): Promise<HTMLDivElement> {
  const parent = document.createElement('div')

  const [{ greeting }] = await query({
    env,
    client: new ParsingClient({
      endpointUrl: 'https://query.wikidata.org/sparql',
    }),
  })

  const h1 = document.createElement('h1')
  h1.textContent = greeting.value
  parent.appendChild(h1)

  return parent
}
