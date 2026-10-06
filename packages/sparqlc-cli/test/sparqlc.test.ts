import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import sinon from 'sinon'
import { createCompilerCommand, runCompilerCli } from '../sparqlc.js'

const require = createRequire(import.meta.url)
const testDir = path.dirname(fileURLToPath(import.meta.url))
const binPath = path.resolve(testDir, '../bin/sparqlc.js')
const tsxPath = require.resolve('tsx')

function runSparqlcCli(args: string[], cwd: string): Promise<{ stdout: string, stderr: string, code: number | null }> {
  return new Promise((resolve) => {
    const proc = cp.spawn(process.execPath, ['--import', tsxPath, binPath, ...args], {
      cwd,
      env: { ...process.env, NODE_OPTIONS: '' },
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })
  })
}

describe('sparqlc CLI', function () {
  let tempDir: string

  beforeEach(function () {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparqlc-cli-test-')))
  })

  afterEach(function () {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    sinon.restore()
  })

  describe('unit', function () {
    it('creates commander program with options', function () {
      const prog = createCompilerCommand()
      expect(prog.name()).to.eq('sparqlc')
      expect(prog.description()).to.include('Compile a SPARQL')
    })

    it('compiles query and writes code to stdout', function () {
      const queryFile = path.join(tempDir, 'query.rq')
      fs.writeFileSync(queryFile, 'SELECT ?s ?p ?o WHERE { ?s ?p ?o }')

      let written = ''
      const writeStub = sinon.stub(process.stdout, 'write').callsFake(((chunk: string | Uint8Array) => {
        written += chunk.toString()
        return true
      }) as typeof process.stdout.write)

      runCompilerCli(['node', 'sparqlc', queryFile])
      writeStub.restore()

      expect(written).to.include('sparqlc')
      expect(written).to.include('"queryType":"SELECT"')
    })

    it('compiles query with base option', function () {
      const queryFile = path.join(tempDir, 'base.rq')
      fs.writeFileSync(queryFile, 'SELECT * WHERE { <relative-path> ?p ?o }')

      let written = ''
      const writeStub = sinon.stub(process.stdout, 'write').callsFake(((chunk: string | Uint8Array) => {
        written += chunk.toString()
        return true
      }) as typeof process.stdout.write)

      runCompilerCli(['node', 'sparqlc', '-b', 'http://example.org/base/', queryFile])
      writeStub.restore()

      expect(written).to.include('http://example.org/base/relative-path')
    })

    it('runs with default process.argv when no arguments passed', function () {
      const origArgv = process.argv
      try {
        const queryFile = path.join(tempDir, 'default-argv.rq')
        fs.writeFileSync(queryFile, 'SELECT ?s WHERE { ?s ?p ?o }')
        process.argv = ['node', 'sparqlc', queryFile]

        let written = ''
        const writeStub = sinon.stub(process.stdout, 'write').callsFake(((chunk: string | Uint8Array) => {
          written += chunk.toString()
          return true
        }) as typeof process.stdout.write)

        runCompilerCli()
        writeStub.restore()

        expect(written).to.include('sparqlc')
      }
      finally {
        process.argv = origArgv
      }
    })
  })

  describe('integration', function () {
    it('compiles a query file and outputs JS module to stdout', async function () {
      const queryFile = path.join(tempDir, 'query.rq')
      fs.writeFileSync(queryFile, 'SELECT ?name WHERE { ?person <http://xmlns.com/foaf/0.1/name> ?name }')

      const res = await runSparqlcCli([queryFile], tempDir)
      expect(res.code).to.eq(0)
      expect(res.stdout).to.include('"queryType":"SELECT"')
      expect(res.stdout).to.include('http://xmlns.com/foaf/0.1/name')
    })

    it('compiles a query with -b / --base flag', async function () {
      const queryFile = path.join(tempDir, 'relative.rq')
      fs.writeFileSync(queryFile, 'SELECT * WHERE { <test> ?p ?o }')

      const res = await runSparqlcCli(['--base', 'http://example.com/api/', queryFile], tempDir)
      expect(res.code).to.eq(0)
      expect(res.stdout).to.include('http://example.com/api/test')
    })

    it('compiles a SPARQL update file', async function () {
      const updateFile = path.join(tempDir, 'update.ru')
      fs.writeFileSync(updateFile, 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }')

      const res = await runSparqlcCli([updateFile], tempDir)
      expect(res.code).to.eq(0)
      expect(res.stdout).to.include('"type":"update"')
    })

    it('prints help when --help is passed', async function () {
      const res = await runSparqlcCli(['--help'], tempDir)
      expect(res.code).to.eq(0)
      expect(res.stdout).to.include('Usage: sparqlc')
      expect(res.stdout).to.include('--base <iri>')
    })

    it('fails with error message when file does not exist', async function () {
      const res = await runSparqlcCli(['non-existent.rq'], tempDir)
      expect(res.code).to.not.eq(0)
    })
  })
})
