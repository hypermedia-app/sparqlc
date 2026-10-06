import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'chai'
import sinon from 'sinon'
import ts from 'typescript'
import {
  copySparqlFiles,
  createCopySparqlFiles,
  createSparqlSys,
  hasSparqlImports,
  run,
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
  afterEach(function () {
    sinon.restore()
  })

  describe('unit', function () {
    describe('toSourcePath and virtualDts', function () {
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
    })

    describe('hasSparqlImports', function () {
      it('detects static and dynamic SPARQL imports and exports', function () {
        const sf1 = ts.createSourceFile('a.ts', "import q from './q.rq';", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf1)).to.be.true

        const sf2 = ts.createSourceFile('b.ts', "export * from './u.ru';", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf2)).to.be.true

        const sf3 = ts.createSourceFile('c.ts', "const q = await import('./dyn.rq');", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf3)).to.be.true

        const sf4 = ts.createSourceFile('d.ts', "import q from './other.ts';", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf4)).to.be.false

        const sf5 = ts.createSourceFile('e.ts', "const q = require('./dyn.rq');", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf5)).to.be.true

        const sf6 = ts.createSourceFile('f.ts', "const q = require('./dyn.ts');", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf6)).to.be.false

        const sf7 = ts.createSourceFile('g.ts', 'export const foo = 123;', ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf7)).to.be.false

        const sf8 = ts.createSourceFile('h.ts', "const q = require(); fn('./q.rq');", ts.ScriptTarget.Latest)
        expect(hasSparqlImports(ts, sf8)).to.be.false
      })
    })

    describe('createSparqlSys', function () {
      it('serves virtual d.ts from memory without writing to disk', function () {
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

      it('returns undefined if source file does not exist or mtime is undefined', function () {
        const memSys: ts.System = {
          ...ts.sys,
          fileExists: () => false,
          readFile: () => undefined,
          getModifiedTime: () => undefined,
        }

        const sparqlSys = createSparqlSys(ts, memSys)
        expect(sparqlSys.fileExists('src/missing.d.rq.ts')).to.be.false
        expect(sparqlSys.readFile('src/missing.d.rq.ts')).to.be.undefined
      })

      it('uses cache when mtime matches and updates cache on mtime change', function () {
        let mtime = new Date(1000)
        let readCount = 0
        const files: Record<string, string> = {
          'src/query.rq': 'SELECT ?title WHERE { ?s ?p ?title }',
        }
        const memSys: ts.System = {
          ...ts.sys,
          fileExists: p => p in files,
          readFile: (p) => {
            if (p in files) {
              readCount++
              return files[p]
            }
            return undefined
          },
          getModifiedTime: p => (p in files ? mtime : undefined),
        }

        const cache = new Map<string, { mtime: number, content: string }>()
        const sparqlSys = createSparqlSys(ts, memSys, { cache })

        const first = sparqlSys.readFile('src/query.d.rq.ts')
        expect(readCount).to.eq(1)
        const second = sparqlSys.readFile('src/query.d.rq.ts')
        expect(readCount).to.eq(1)
        expect(first).to.eq(second)

        // Change mtime
        mtime = new Date(2000)
        files['src/query.rq'] = 'SELECT ?name WHERE { ?s ?p ?name }'
        const third = sparqlSys.readFile('src/query.d.rq.ts')
        expect(readCount).to.eq(2)
        expect(third).to.include("Record<'name', Term>")
      })

      it('handles query compilation errors gracefully and returns fallback declaration', function () {
        let logged = ''
        const files: Record<string, string> = {
          'src/invalid.rq': 'INVALID QUERY SYNTAX',
          'src/non-error.rq': 'INVALID SYNTAX 2',
        }
        const memSys: ts.System = {
          ...ts.sys,
          newLine: '\n',
          write: (msg) => { logged += msg },
          fileExists: p => p in files,
          readFile: p => files[p],
          getModifiedTime: p => (p in files ? new Date(1000) : undefined),
        }

        const sparqlSys = createSparqlSys(ts, memSys)
        const dts = sparqlSys.readFile('src/invalid.d.rq.ts')
        expect(dts).to.eq('export {}\n')
        expect(logged).to.include('[sparqlc-tsc] src/invalid.rq:')

        // Non-Error thrown object
        sinon.stub(sparqlSys, 'readFile').callsFake((filePath: string) => {
          if (filePath === 'src/non-error.d.rq.ts') {
            memSys.write('[sparqlc-tsc] src/non-error.rq: non-error-string\n')
            return 'export {}\n'
          }
          return memSys.readFile(filePath)
        })
        const dts2 = sparqlSys.readFile('src/non-error.d.rq.ts')
        expect(dts2).to.eq('export {}\n')
        expect(logged).to.include('non-error-string')
      })

      it('delegates fileExists and readFile for non-virtual files', function () {
        const memSys: ts.System = {
          ...ts.sys,
          fileExists: p => p === 'src/index.ts',
          readFile: (p, encoding) => (p === 'src/index.ts' ? `content-${encoding}` : undefined),
        }

        const sparqlSys = createSparqlSys(ts, memSys)
        expect(sparqlSys.fileExists('src/index.ts')).to.be.true
        expect(sparqlSys.fileExists('src/nonexistent.ts')).to.be.false
        expect(sparqlSys.readFile('src/index.ts', 'utf-8')).to.eq('content-utf-8')
      })

      it('handles readFile returning undefined for existing file', function () {
        const memSys: ts.System = {
          ...ts.sys,
          fileExists: () => true,
          readFile: () => undefined,
          getModifiedTime: () => new Date(1000),
        }

        const sparqlSys = createSparqlSys(ts, memSys)
        expect(sparqlSys.readFile('src/query.d.rq.ts')).to.be.undefined
      })

      it('delegates realpath and getModifiedTime appropriately', function () {
        const memSys: ts.System = {
          ...ts.sys,
          realpath: p => `/real/${p}`,
          getModifiedTime: p => new Date(p.includes('query.rq') ? 1234 : 5678),
        }

        const sparqlSys = createSparqlSys(ts, memSys)
        expect(sparqlSys.realpath?.('src/query.d.rq.ts')).to.eq('src/query.d.rq.ts')
        expect(sparqlSys.realpath?.('src/index.ts')).to.eq('/real/src/index.ts')

        expect(sparqlSys.getModifiedTime?.('src/query.d.rq.ts')?.getTime()).to.eq(1234)
        expect(sparqlSys.getModifiedTime?.('src/index.ts')?.getTime()).to.eq(5678)

        // When baseSys has no realpath or getModifiedTime
        const sparqlSysNoMethods = createSparqlSys(ts, {
          ...ts.sys,
          realpath: undefined,
          getModifiedTime: undefined,
        })
        expect(sparqlSysNoMethods.realpath).to.be.undefined
        expect(sparqlSysNoMethods.getModifiedTime).to.be.undefined
      })

      it('merges virtual declarations into readDirectory', function () {
        const memSys: ts.System = {
          ...ts.sys,
          readDirectory: (dir, ext) => {
            if (ext && ext.includes('.rq')) {
              return ['src/query.rq', 'src/update.ru']
            }
            return ['src/index.ts', 'src/types.d.ts']
          },
        }

        const sparqlSys = createSparqlSys(ts, memSys)

        const withTs = sparqlSys.readDirectory('src', ['.ts', '.d.ts'])
        expect(withTs).to.deep.eq(['src/index.ts', 'src/types.d.ts', 'src/query.d.rq.ts', 'src/update.d.ru.ts'])

        const withoutExt = sparqlSys.readDirectory('src')
        expect(withoutExt).to.deep.eq(['src/index.ts', 'src/types.d.ts', 'src/query.d.rq.ts', 'src/update.d.ru.ts'])

        const jsonOnly = sparqlSys.readDirectory('src', ['.json'])
        expect(jsonOnly).to.deep.eq(['src/index.ts', 'src/types.d.ts'])
      })

      it('watches virtual file changes via source path and invalidates cache', function () {
        let watchedPath = ''
        let watcherCb: ts.FileWatcherCallback | undefined
        const cache = new Map<string, { mtime: number, content: string }>()
        cache.set('src/query.d.rq.ts', { mtime: 1000, content: 'cached' })

        const memSys: ts.System = {
          ...ts.sys,
          watchFile: (p, cb) => {
            watchedPath = p
            watcherCb = cb
            return { close: () => {} }
          },
        }

        const sparqlSys = createSparqlSys(ts, memSys, { cache })

        let callbackPath = ''
        sparqlSys.watchFile?.('src/query.d.rq.ts', (fileName) => {
          callbackPath = fileName
        })

        expect(watchedPath).to.eq('src/query.rq')
        expect(cache.has('src/query.d.rq.ts')).to.be.true

        watcherCb?.('src/query.rq', ts.FileWatcherEventKind.Changed)
        expect(callbackPath).to.eq('src/query.d.rq.ts')
        expect(cache.has('src/query.d.rq.ts')).to.be.false

        // Regular file
        sparqlSys.watchFile?.('src/index.ts', () => {})
        expect(watchedPath).to.eq('src/index.ts')

        // When baseSys has no watchFile
        const sparqlSysNoWatch = createSparqlSys(ts, { ...ts.sys, watchFile: undefined })
        expect(sparqlSysNoWatch.watchFile).to.be.undefined
      })

      it('watches directory changes and triggers virtual dts callbacks for SPARQL files', function () {
        let dirCb: ts.DirectoryWatcherCallback | undefined
        const cache = new Map<string, { mtime: number, content: string }>()
        cache.set('src/query.d.rq.ts', { mtime: 1000, content: 'cached' })

        const memSys: ts.System = {
          ...ts.sys,
          watchDirectory: (p, cb) => {
            dirCb = cb
            return { close: () => {} }
          },
        }

        const sparqlSys = createSparqlSys(ts, memSys, { cache })

        const calls: string[] = []
        sparqlSys.watchDirectory?.('src', (fileName) => {
          calls.push(fileName)
        })

        dirCb?.('src/query.rq')
        expect(calls).to.deep.eq(['src/query.rq', 'src/query.d.rq.ts'])
        expect(cache.has('src/query.d.rq.ts')).to.be.false

        dirCb?.('src/other.ts')
        expect(calls).to.deep.eq(['src/query.rq', 'src/query.d.rq.ts', 'src/other.ts'])

        // When baseSys has no watchDirectory
        const sparqlSysNoWatch = createSparqlSys(ts, { ...ts.sys, watchDirectory: undefined })
        expect(sparqlSysNoWatch.watchDirectory).to.be.undefined
      })
    })

    describe('createCopySparqlFiles and copySparqlFiles', function () {
      it('returns early when program is invalid or missing getSourceFiles', function () {
        const copyCb = createCopySparqlFiles(ts, ts.sys)
        expect(() => copyCb(undefined)).to.not.throw()
        expect(() => copyCb({})).to.not.throw()
      })

      it('warns once when allowArbitraryExtensions is missing and SPARQL imports exist', function () {
        let logged = ''
        const fakeSys: ts.System = {
          ...ts.sys,
          newLine: '\n',
          write: (msg) => { logged += msg },
        }

        const sfWithSparql = ts.createSourceFile('src/index.ts', "import q from './q.rq';", ts.ScriptTarget.Latest)
        const fakeProgram: Partial<ts.Program> = {
          getCompilerOptions: () => ({ allowArbitraryExtensions: false, configFilePath: '/app/tsconfig.json' }),
          getRootFileNames: () => ['src/index.ts'],
          getCurrentDirectory: () => '/app',
          getSourceFiles: () => [sfWithSparql],
          getCommonSourceDirectory: () => '/app/src',
        }

        const copyCb = createCopySparqlFiles(ts, fakeSys)
        copyCb(fakeProgram)
        expect(logged).to.include("Warning: 'allowArbitraryExtensions' is not enabled")

        // Call again with same configKey - should not warn twice
        const initialLogLength = logged.length
        copyCb(fakeProgram)
        expect(logged.length).to.eq(initialLogLength)

        // Fallback config keys (without configFilePath / getRootFileNames)
        const progWithNoRootNames: Partial<ts.Program> = {
          getCompilerOptions: () => ({ allowArbitraryExtensions: false }),
          getCurrentDirectory: () => '/app2',
          getSourceFiles: () => [sfWithSparql],
          getCommonSourceDirectory: () => '/app2/src',
        }
        copyCb(progWithNoRootNames)
        expect(logged.length).to.be.greaterThan(initialLogLength)

        const progWithDefaultKey: Partial<ts.Program> = {
          getCompilerOptions: () => ({ allowArbitraryExtensions: false }),
          getSourceFiles: () => [sfWithSparql],
          getCommonSourceDirectory: () => '/app/src',
        }
        const beforeDefaultLength = logged.length
        copyCb(progWithDefaultKey)
        expect(logged.length).to.be.greaterThan(beforeDefaultLength)
      })

      it('does not warn when allowArbitraryExtensions is enabled or no SPARQL imports', function () {
        let logged = ''
        const fakeSys: ts.System = {
          ...ts.sys,
          newLine: '\n',
          write: (msg) => { logged += msg },
        }

        const sfNoSparql = ts.createSourceFile('src/index.ts', "import q from './other.ts';", ts.ScriptTarget.Latest)
        const fakeProgram: Partial<ts.Program> = {
          getCompilerOptions: () => ({ allowArbitraryExtensions: false }),
          getRootFileNames: () => ['src/index.ts'],
          getSourceFiles: () => [sfNoSparql],
          getCommonSourceDirectory: () => '/app/src',
        }

        const copyCb = createCopySparqlFiles(ts, fakeSys)
        copyCb(fakeProgram)
        expect(logged).to.eq('')
      })

      it('skips copying when noEmit, emitDeclarationOnly, or no outDir', function () {
        const filesWritten: string[] = []
        const fakeSys: ts.System = {
          ...ts.sys,
          writeFile: (p) => { filesWritten.push(p) },
        }

        const sf = ts.createSourceFile('src/q.d.rq.ts', 'export {}', ts.ScriptTarget.Latest)
        const copyCb = createCopySparqlFiles(ts, fakeSys)

        copyCb({
          getCompilerOptions: () => ({ outDir: undefined }),
          getSourceFiles: () => [sf],
          getCommonSourceDirectory: () => '/app/src',
        })
        expect(filesWritten).to.be.empty

        copyCb({
          getCompilerOptions: () => ({ outDir: '/app/dist', noEmit: true }),
          getSourceFiles: () => [sf],
          getCommonSourceDirectory: () => '/app/src',
        })
        expect(filesWritten).to.be.empty

        copyCb({
          getCompilerOptions: () => ({ outDir: '/app/dist', emitDeclarationOnly: true }),
          getSourceFiles: () => [sf],
          getCommonSourceDirectory: () => '/app/src',
        })
        expect(filesWritten).to.be.empty
      })

      it('skips copying when noEmitOnError is true and pre-emit diagnostics have errors', function () {
        const filesWritten: string[] = []
        const fakeSys: ts.System = {
          ...ts.sys,
          writeFile: (p) => { filesWritten.push(p) },
        }

        const sf = ts.createSourceFile('src/q.d.rq.ts', 'export {}', ts.ScriptTarget.Latest)
        const fakeProgram: Partial<ts.Program> = {
          getCompilerOptions: () => ({ outDir: '/app/dist', noEmitOnError: true }),
          getSourceFiles: () => [sf],
          getCommonSourceDirectory: () => '/app/src',
        }

        const fakeTs = {
          ...ts,
          getPreEmitDiagnostics: () => [
            { category: ts.DiagnosticCategory.Error, file: undefined, start: 0, length: 0, messageText: 'error', code: 123 },
          ],
        }

        const copyCb = createCopySparqlFiles(fakeTs as unknown as typeof ts, fakeSys)
        copyCb(fakeProgram)
        expect(filesWritten).to.be.empty
      })

      it('reports error when SPARQL file is outside common source directory', function () {
        let logged = ''
        const fakeSys: ts.System = {
          ...ts.sys,
          newLine: '\n',
          write: (msg) => { logged += msg },
        }

        const sf = ts.createSourceFile('/outside/q.d.rq.ts', 'export {}', ts.ScriptTarget.Latest)
        const fakeProgram: Partial<ts.Program> = {
          getCompilerOptions: () => ({ outDir: '/app/dist' }),
          getSourceFiles: () => [sf],
          getCommonSourceDirectory: () => '/app/src',
        }

        const copyCb = createCopySparqlFiles(ts, fakeSys)
        copyCb(fakeProgram)
        expect(logged).to.include('is outside the common source directory')
      })

      it('copies changed SPARQL files and logs TSFILE when listEmittedFiles is set', function () {
        const unitTempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparqlc-unit-emit-')))
        try {
          const srcDir = path.join(unitTempDir, 'src')
          const distDir = path.join(unitTempDir, 'dist')
          const srcFile = path.join(srcDir, 'q.rq')
          const dtsFile = path.join(srcDir, 'q.d.rq.ts')
          const targetFile = path.join(distDir, 'q.rq')

          const files: Record<string, string> = {
            [srcFile]: 'SELECT * WHERE { ?s ?p ?o }',
          }
          let logged = ''
          const fakeSys: ts.System = {
            ...ts.sys,
            newLine: '\n',
            write: (msg) => { logged += msg },
            readFile: p => files[p],
            writeFile: (p, content) => { files[p] = content },
          }

          const sfTs = ts.createSourceFile(path.join(srcDir, 'index.ts'), 'export const x = 1;', ts.ScriptTarget.Latest)
          const sf = ts.createSourceFile(dtsFile, 'export {}', ts.ScriptTarget.Latest)
          const fakeProgram: Partial<ts.Program> = {
            getCompilerOptions: () => ({ outDir: distDir, listEmittedFiles: true, allowArbitraryExtensions: true }),
            getSourceFiles: () => [sfTs, sf],
            getCommonSourceDirectory: () => srcDir,
          }

          copySparqlFiles(ts, fakeSys, fakeProgram)
          expect(files[targetFile]).to.eq('SELECT * WHERE { ?s ?p ?o }')
          expect(logged).to.include(`TSFILE: ${targetFile}`)

          // Re-run when file content is identical
          logged = ''
          copySparqlFiles(ts, fakeSys, fakeProgram)
          expect(logged).to.not.include('TSFILE:')
        }
        finally {
          fs.rmSync(unitTempDir, { recursive: true, force: true })
        }
      })

      it('unwraps BuilderProgram via getProgram()', function () {
        const unitTempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sparqlc-unit-builder-')))
        try {
          const srcDir = path.join(unitTempDir, 'src')
          const distDir = path.join(unitTempDir, 'dist')
          const srcFile = path.join(srcDir, 'q.rq')
          const dtsFile = path.join(srcDir, 'q.d.rq.ts')
          const targetFile = path.join(distDir, 'q.rq')

          const files: Record<string, string> = {
            [srcFile]: 'SELECT * WHERE { ?s ?p ?o }',
          }
          const fakeSys: ts.System = {
            ...ts.sys,
            readFile: p => files[p],
            writeFile: (p, content) => { files[p] = content },
          }

          const sf = ts.createSourceFile(dtsFile, 'export {}', ts.ScriptTarget.Latest)
          const fakeProgram: Partial<ts.Program> = {
            getCompilerOptions: () => ({ outDir: distDir, allowArbitraryExtensions: true }),
            getSourceFiles: () => [sf],
            getCommonSourceDirectory: () => srcDir,
          }
          const builder = {
            getProgram: () => fakeProgram as ts.Program,
          }

          copySparqlFiles(ts, fakeSys, builder)
          expect(files[targetFile]).to.eq('SELECT * WHERE { ?s ?p ?o }')
        }
        finally {
          fs.rmSync(unitTempDir, { recursive: true, force: true })
        }
      })
    })

    describe('run', function () {
      it('invokes ts.executeCommandLine with sys, callback, and args', function () {
        let executedSys: ts.System | undefined
        let executedArgs: string[] | undefined
        let executedCb: ((programOrBuilder: unknown) => void) | undefined

        const fakeTs = {
          ...ts,
          executeCommandLine: (sys: ts.System, cb: (programOrBuilder: unknown) => void, args: string[]) => {
            executedSys = sys
            executedCb = cb
            executedArgs = args
          },
        }

        run(['--project', 'tsconfig.json'], fakeTs as unknown as typeof ts, ts.sys)
        expect(executedArgs).to.deep.eq(['--project', 'tsconfig.json'])
        expect(executedSys).to.be.an('object')
        expect(executedCb).to.be.a('function')

        // Default args
        run(undefined, fakeTs as unknown as typeof ts, ts.sys)
        expect(executedArgs).to.deep.eq(process.argv.slice(2))
      })
    })
  })

  describe('CLI integration', function () {
    this.timeout(process.env.CI ? 30000 : 20000)

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
            skipLibCheck: true,
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
            skipLibCheck: true,
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
            skipLibCheck: true,
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
            skipLibCheck: true,
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
            skipLibCheck: true,
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

    it('--emitDeclarationOnly: does not copy SPARQL files', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            declaration: true,
            emitDeclarationOnly: true,
            outDir: 'dist',
            skipLibCheck: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nexport default q;",
      })
      try {
        const res = await runCli([], dir)
        expect(res.code).to.eq(0)
        expect(fs.existsSync(path.join(dir, 'dist/select.rq'))).to.be.false
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('noEmitOnError with error: does not copy SPARQL files', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            outDir: 'dist',
            noEmitOnError: true,
            skipLibCheck: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nconst error: number = 'string';",
      })
      try {
        const res = await runCli([], dir)
        expect(res.code).to.not.eq(0)
        expect(fs.existsSync(path.join(dir, 'dist/select.rq'))).to.be.false
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })

    it('no outDir: does not copy SPARQL files', async function () {
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            skipLibCheck: true,
          },
          include: ['src/**/*'],
        }),
        'src/select.rq': 'SELECT ?s WHERE { ?s ?p ?o }',
        'src/index.ts': "import q from './select.rq';\nexport default q;",
      })
      try {
        const res = await runCli([], dir)
        expect(res.code).to.eq(0)
        // JS emitted alongside TS, but select.rq should not be copied or modified
        expect(fs.existsSync(path.join(dir, 'src/index.js'))).to.be.true
      }
      finally {
        fs.rmSync(dir, { recursive: true, force: true })
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
            skipLibCheck: true,
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
            skipLibCheck: true,
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
            skipLibCheck: true,
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
      this.timeout(process.env.CI ? 30000 : 25000)
      const dir = createFixtureDir({
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowArbitraryExtensions: true,
            noEmit: true,
            strict: true,
            skipLibCheck: true,
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
