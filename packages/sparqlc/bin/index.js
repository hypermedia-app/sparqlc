/* eslint-disable no-console */
import * as fs from 'node:fs'
import env from '@zazuko/env'
import { stringToTerm } from 'rdf-string'
import { compile } from '../index.js'

// read query from file path (first CLI param)
const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: sparqlc <path-to-query-file>')
  process.exit(2) // eslint-disable-line n/no-process-exit
}

// collect the rest of the CLI params as bindings
const bindings = process.argv.slice(3)
  .map((binding) => {
    const [name, value] = binding.split('=')
    return [name, stringToTerm(value)]
  })

const query = fs.readFileSync(filePath, 'utf8')
const result = compile(query)
console.log(await result.execute(Object.fromEntries(bindings), { env }))
