import { ParsingClient } from 'sparql-http-client'
import env from '@zazuko/env'
import query from './query.rq'

const client = new ParsingClient({
  endpointUrl: 'https://lindas.admin.ch/query',
})

const [{ greeting }] = await query({ client, env })

process.stdout.write(greeting.value)
