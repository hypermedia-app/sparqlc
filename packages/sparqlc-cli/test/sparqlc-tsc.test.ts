import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import ts from 'typescript'
import {
  createSparqlSys,
  hasSparqlImports,
  toSourcePath,
  virtualDts,
} from '../index.js'

const require = createRequire(import.meta.url)
const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../../..')
const binPath = path.resolve(testDir, '../bin/sparqlc-tsc.js')
const tsxPath = require.resolve('tsx')

function runCli(args: string[], cwd: string): Promise<{ stdout: string, stderr: string, code: number | null }> {
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

function createFixtureDir(files: Record<string, string>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparqlc-tsc-test-')))
  // Link node_modules so dependencies like sparqlc and @rdfjs/types resolve
  const targetNodeModules = path.join(dir, 'node_modules')
  try {
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), targetNodeModules, 'junction')
  }
  catch {
    // If symlink fails, continue
  }

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }
  return dir
}

describe('sparqlc-tsc', function () {
  describe('unit helpers', function () {
    it('toSourcePath converts virtual dts to source path', function () {
      expect(toSourcePath('src/query.d.rq.ts')).to.eq('src/query.rq')
      expect(toSourcePath('src/update.d.ru.ts')).to.eq('src/update.ru')
    })

    it('virtualDts matches .d.rq.ts and .d.ru.ts', function () {
      expect(virtualDts.test('foo.d.rq.ts')).to.be.true
      expect(virtualDts.test('foo.d.ru.ts')).to.be.true
      expect(virtualDts.test('foo.d.ts')).to.be.false
      expect(virtualDts.test('foo.rq')).to.be.false
    })

    it('hasSparqlImports detects static and dynamic SPARQL imports', function () {
      const sf1 = ts.createSourceFile('a.ts', "import q from './q.rq';", ts.ScriptTarget.Latest)
      expect(hasSparqlImports(ts, sf1)).to.be.true

      const sf2 = ts.createSourceFile('b.ts', "export * from './u.ru';", ts.ScriptTarget.Latest)
      expect(hasSparqlImports(ts, sf2)).to.be.true

      const sf3 = ts.createSourceFile('c.ts', "const q = await import('./dyn.rq');", ts.ScriptTarget.Latest)
      expect(hasSparqlImports(ts, sf3)).to.be.true

      const sf4 = ts.createSourceFile('d.ts', "import q from './other.ts';", ts.ScriptTarget.Latest)
      expect(hasSparqlImports(ts, sf4)).to.be.false
    })

    it('createSparqlSys serves virtual d.ts from memory without writing to disk', function () {
      const files: Record<string, string> = {
        'src/query.rq': 'SELECT ?title WHERE { ?s ?p ?title }',
      }
      const memSys: ts.System = {
        ...ts.sys,
        fileExists: p => p in files,
        readFile: p => files[p],
        getModifiedTime: p => (p in files ? new Date(1000) : undefined),
      }

      const sparqlSys = createSparqlSys(ts, memSys)
      expect(sparqlSys.fileExists('src/query.d.rq.ts')).to.be.true
      const dts = sparqlSys.readFile('src/query.d.rq.ts')
      expect(dts).to.include('sparqlc.ExecuteSelect')
      expect(dts).to.include("Record<'title', Term>")
    })
  })

  describe('CLI integration', function () {
    this.timeout(20000)

    it('passes through -v and --help', async function () {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparqlc-tsc-help-')))
      const resVersion = await runCli(['-v'], dir)
      expect(resVersion.code).to.eq(0)
      expect(resVersion.stdout).to.include('Version')

      const resHelp = await runCli(['--help'], dir)
      expect(resHelp.code).to.eq(0)
      expect(resHelp.stdout).to.include('The TypeScript Compiler')
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('infers typed SELECT bindings and fails on unknown properties (TS2339)', async function () {
      const dir = createFixtureDir({
        'valid/tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'valid/src/query.rq': 'SELECT ?title ?author WHERE { ?s <http://example.org/title> ?title ; <http://example.org/author> ?author }',
        'valid/src/index.ts': `
import selectQuery, { Bindings } from './query.rq'
import type { Term } from '@rdfjs/types'
import type { ParsingClient } from 'sparql-http-client'

async function test(client: ParsingClient, env: any) {
  const rows = await selectQuery({ env, client })
  const first = rows[0]
  const title: Term = first.title
  const author: Term = first.author
}
`,
        'invalid/tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'invalid/src/query.rq': 'SELECT ?title ?author WHERE { ?s <http://example.org/title> ?title ; <http://example.org/author> ?author }',
        'invalid/src/index.ts': `
import selectQuery from './query.rq'
import type { ParsingClient } from 'sparql-http-client'

async function test(client: ParsingClient, env: any) {
  const rows = await selectQuery({ env, client })
  const first = rows[0]
  // Property notInQuery does not exist on inferred Bindings
  const x = first.notInQuery
}
`,
      })

      try {
        const resValid = await runCli([], path.join(dir, 'valid'))
        expect(resValid.code).to.eq(0)
        expect(resValid.stdout).to.not.include('error TS')

        const resInvalid = await runCli([], path.join(dir, 'invalid'))
        expect(resInvalid.code).to.not.eq(0)
        expect(resInvalid.stdout).to.include('error TS2339')
        expect(resInvalid.stdout).to.include('notInQuery')
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('noEmit: exits 0 and writes no files anywhere', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
          },
        }),
        'src/query.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './query.rq';\nexport default q;",
      })

      try {
        const beforeFiles = fs.readdirSync(dir, { recursive: true }).sort()
        const res = await runCli([], dir)
        expect(res.code).to.eq(0)
        const afterFiles = fs.readdirSync(dir, { recursive: true }).sort()
        expect(afterFiles).to.deep.eq(beforeFiles)
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('emit to outDir: emits JS, copies .rq/.ru mirroring layout, and no .d.rq.ts in outDir', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            outDir: 'dist',
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'src/queries/select.rq': 'SELECT ?item WHERE { ?s ?p ?item }',
        'src/queries/update.ru': 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }',
        'src/index.ts': "import q from './queries/select.rq';\nimport u from './queries/update.ru';\nexport { q, u };",
      })

      try {
        const res = await runCli([], dir)
        expect(res.code).to.eq(0)

        expect(fs.existsSync(path.join(dir, 'dist/index.js'))).to.be.true
        expect(fs.existsSync(path.join(dir, 'dist/queries/select.rq'))).to.be.true
        expect(fs.existsSync(path.join(dir, 'dist/queries/update.ru'))).to.be.true

        // Assert content is byte-identical
        expect(fs.readFileSync(path.join(dir, 'dist/queries/select.rq'), 'utf8')).to.eq(
          fs.readFileSync(path.join(dir, 'src/queries/select.rq'), 'utf8'),
        )

        // Assert no virtual declaration files were written to disk
        expect(fs.existsSync(path.join(dir, 'dist/queries/select.d.rq.ts'))).to.be.false
        expect(fs.existsSync(path.join(dir, 'src/queries/select.d.rq.ts'))).to.be.false
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('re-run with no changes copies nothing (verified via --listEmittedFiles)', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            outDir: 'dist',
            listEmittedFiles: true,
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nexport default q;",
      })

      try {
        const res1 = await runCli([], dir)
        expect(res1.code).to.eq(0)
        expect(res1.stdout).to.include('TSFILE: ' + path.resolve(dir, 'dist/select.rq'))

        const res2 = await runCli([], dir)
        expect(res2.code).to.eq(0)
        // TS may re-emit index.js (unless incremental), but should NOT re-emit unchanged select.rq
        expect(res2.stdout).to.not.include('TSFILE: ' + path.resolve(dir, 'dist/select.rq'))
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('--emitDeclarationOnly, noEmitOnError with error, and no outDir: no copies', async function () {
    // 1. --emitDeclarationOnly
      const dir1 = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            declaration: true,
            emitDeclarationOnly: true,
            outDir: 'dist',
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nexport default q;",
      })
      try {
        const res1 = await runCli([], dir1)
        expect(res1.code).to.eq(0)
        expect(fs.existsSync(path.join(dir1, 'dist/select.rq'))).to.be.false
      }
      finally {
        fs.rmSync(dir1, { recursive: true, force: true })
      }

      // 2. noEmitOnError with an error
      const dir2 = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            outDir: 'dist',
            noEmitOnError: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nconst error: number = 'string';",
      })
      try {
        const res2 = await runCli([], dir2)
        expect(res2.code).to.not.eq(0)
        expect(fs.existsSync(path.join(dir2, 'dist/select.rq'))).to.be.false
      }
      finally {
        fs.rmSync(dir2, { recursive: true, force: true })
      }

      // 3. No outDir
      const dir3 = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nexport default q;",
      })
      try {
        const res3 = await runCli([], dir3)
        expect(res3.code).to.eq(0)
        // JS emitted alongside TS, but select.rq should not be copied or modified
        expect(fs.existsSync(path.join(dir3, 'src/index.js'))).to.be.true
      }
      finally {
        fs.rmSync(dir3, { recursive: true, force: true })
      }
    })

    it('invalid .rq: prints message naming the file and type error at the import', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'src/broken.rq': 'INVALID SPARQL SYNTAX QUERY',
        'src/index.ts': "import broken from './broken.rq';\nconst x: number = broken;",
      })

      try {
        const res = await runCli([], dir)
        expect(res.code).to.not.eq(0)
        expect(res.stdout).to.include('[sparqlc-tsc]')
        expect(res.stdout).to.include('broken.rq')
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('missing allowArbitraryExtensions: prints warning', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: false,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['src/**/*'],
        }),
        'src/query.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './query.rq';\nexport default q;",
      })

      try {
        const res = await runCli([], dir)
        expect(res.stdout).to.include("Warning: 'allowArbitraryExtensions' is not enabled")
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('.rq outside the common source dir: reports diagnostic error', async function () {
      const dir = createFixtureDir({
        'project/tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            outDir: 'dist',
            rootDir: 'src',
          },
          include: ['src/**/*'],
        }),
        'shared/external.rq': 'SELECT ?shared WHERE { ?s ?p ?shared }',
        'project/src/index.ts': "import q from '../../shared/external.rq';\nexport default q;",
      })

      try {
        const res = await runCli([], path.join(dir, 'project'))
        expect(res.stdout).to.include('outside the common source directory')
        expect(fs.existsSync(path.join(dir, 'project/dist/external.rq'))).to.be.false
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('-b with project references: rebuilds project when .rq is touched', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          files: [],
          references: [{ path: './lib' }],
        }),
        'lib/tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            composite: true,
            outDir: 'dist',
            rootDir: 'src',
            listEmittedFiles: true,
          },
          include: ['src/**/*'],
        }),
        'lib/src/query.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'lib/src/index.ts': "import q from './query.rq';\nexport default q;",
      })

      try {
        const res1 = await runCli(['-b', '--verbose'], dir)
        expect(res1.code).to.eq(0)
        expect(fs.existsSync(path.join(dir, 'lib/dist/query.rq'))).to.be.true

        // Modify query.rq
        const queryFile = path.join(dir, 'lib/src/query.rq')
        const newMtime = new Date(Date.now() + 5000)
        fs.writeFileSync(queryFile, 'SELECT ?s ?newVar WHERE { ?s ?p ?newVar }')
        fs.utimesSync(queryFile, newMtime, newMtime)

        const res2 = await runCli(['-b', '--verbose'], dir)
        expect(res2.code).to.eq(0)
        expect(fs.readFileSync(path.join(dir, 'lib/dist/query.rq'), 'utf8')).to.include('?newVar')
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('--watch: editing a .rq changes error count', function () {
      this.timeout(25000)
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
          },
          include: ['src/**/*'],
        }),
        'src/query.rq': 'SELECT ?a WHERE { ?s <http://example.org/p> ?a }',
        'src/index.ts': `
import selectQuery from './query.rq'
import type { ParsingClient } from 'sparql-http-client'

async function test(client: ParsingClient, env: any) {
  const rows = await selectQuery({ env, client })
  // 'b' is not in query initially -> 1 error
  const val = rows[0].b
}
`,
      })

      return new Promise<void>((resolve, reject) => {
        const proc = cp.spawn(process.execPath, ['--import', tsxPath, binPath, '--watch'], {
          cwd: dir,
          env: { ...process.env, NODE_OPTIONS: '' },
        })
        let output = ''
        let edited = false
        let finished = false

        function cleanupAndDone(err?: Error) {
          if (finished) return
          finished = true
          try {
            proc.kill('SIGKILL')
          }
          catch {
            // Process may already be dead
          }
          try {
            fs.rmSync(dir, { recursive: true, force: true })
          }
          catch {
            // Ignore cleanup errors
          }
          if (err) {
            reject(err)
          }
          else {
            resolve()
          }
        }

        proc.stdout.on('data', (data) => {
          const text = data.toString()
          output += text

          if (output.includes('Found 1 error') && !edited) {
            edited = true
            setTimeout(() => {
              const queryFile = path.join(dir, 'src/query.rq')
              const newMtime = new Date(Date.now() + 2000)
              fs.writeFileSync(queryFile, 'SELECT ?a ?b WHERE { ?s <http://example.org/p1> ?a ; <http://example.org/p2> ?b }')
              fs.utimesSync(queryFile, newMtime, newMtime)
            }, 500)
          }

          if (edited && output.includes('Found 0 errors')) {
            cleanupAndDone()
          }
        })
        proc.stderr.on('data', () => {})

        proc.on('close', () => {
          if (finished) return
          try {
            expect(output).to.include('Found 1 error')
            expect(output).to.include('Found 0 errors')
            cleanupAndDone()
          }
          catch (err) {
            cleanupAndDone(err as Error)
          }
        })

        proc.on('error', (err) => {
          cleanupAndDone(err)
        })
      })
    })
  })
})
