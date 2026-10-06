import fs from 'node:fs'
import { Command } from 'commander'
import { compile } from 'sparqlc'

export function createCompilerCommand(): Command {
  const program = new Command()
  program
    .name('sparqlc')
    .description('Compile a SPARQL query/update file to a JavaScript module')
    .argument('<file>', 'SPARQL file to compile')
    .option('-b, --base <iri>', 'Base IRI for resolving relative IRIs')
    .action((file: string, options: { base?: string }) => {
      const source = fs.readFileSync(file, 'utf-8')
      const compiled = compile(source, { base: options.base })
      process.stdout.write(compiled.code)
    })

  return program
}

export function runCompilerCli(argv: string[] = process.argv): void {
  const program = createCompilerCommand()
  program.parse(argv)
}
