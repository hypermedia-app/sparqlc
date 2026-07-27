import TermMap from '@rdfjs/term-map'
import { isEnv, toTermMap } from 'sparqlc/runtime.js'
import Processor from 'sparqlc/processor.js'

export default async function (...args) {
  const { client, env, processors = [] } = args.pop()

  if (!isEnv(env)) {
    throw new Error('Parameters must be followed by executor options. `env` is required.')
  }

  const params = args.reduce((map, p) => toTermMap(map, p), new TermMap())
  const query = queryObject

  const paramsProcessor = new Processor(env, params)

  const { default: sparqljs } = await import('sparqljs')
  const { Generator } = sparqljs

  const processed = [paramsProcessor, ...processors].reduce((query, processor) => processor.process(query), query)
  if (query.type !== 'query') {
    const updateString = new Generator().stringify(processed)
    console.log(updateString)
    return client.query.update(updateString)
  }

  let method = query.queryType.toLowerCase()
  if (method === 'describe') {
    method = 'construct'
  }

  const queryString = new Generator().stringify(processed)
  if (!client) {
    return queryString
  }

  return client.query[method](queryString)
}
