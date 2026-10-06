import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import { toDeclaration } from 'sparqlc/declarations.js'

declare module 'typescript' {
  function executeCommandLine(
    system: ts.System,
    cb: (programOrBuilder: ts.Program | ts.BuilderProgram | unknown) => void,
    commandLineArgs: string[],
  ): void

  interface Program {
    getCommonSourceDirectory(): string
  }
}

export const virtualDts = /\.d\.r([qu])\.ts$/

export function toSourcePath(dtsPath: string): string {
  return dtsPath.replace(virtualDts, '.r$1')
}

export interface SparqlSysOptions {
  cache?: Map<string, { mtime: number, content: string }>
}

export function createSparqlSys(
  tsModule: typeof ts,
  baseSys: ts.System = tsModule.sys,
  options: SparqlSysOptions = {},
): ts.System {
  const cache = options.cache ?? new Map<string, { mtime: number, content: string }>()

  function readVirtual(dtsPath: string): string | undefined {
    const sourcePath = toSourcePath(dtsPath)
    const mtime = baseSys.getModifiedTime?.(sourcePath)?.getTime()
    if (mtime === undefined || !baseSys.fileExists(sourcePath)) return undefined

    const cached = cache.get(dtsPath)
    if (cached?.mtime === mtime) return cached.content

    let content: string
    try {
      const source = baseSys.readFile(sourcePath)
      if (source === undefined) return undefined
      content = toDeclaration(source)
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      baseSys.write(`[sparqlc-tsc] ${sourcePath}: ${message}${baseSys.newLine}`)
      content = 'export {}\n'
    }
    cache.set(dtsPath, { mtime, content })
    return content
  }

  const sys: ts.System = {
    ...baseSys,
    fileExists: (filePath: string) => (virtualDts.test(filePath) ? readVirtual(filePath) !== undefined : baseSys.fileExists(filePath)),
    readFile: (filePath: string, encoding?: string) => (virtualDts.test(filePath) ? readVirtual(filePath) : baseSys.readFile(filePath, encoding)),
    realpath: baseSys.realpath ? (filePath: string) => (virtualDts.test(filePath) ? filePath : baseSys.realpath!(filePath)) : undefined,
    getModifiedTime: baseSys.getModifiedTime
      ? (filePath: string) => baseSys.getModifiedTime!(virtualDts.test(filePath) ? toSourcePath(filePath) : filePath)
      : undefined,
    readDirectory: (dirPath: string, extensions?: readonly string[], excludes?: readonly string[], includes?: readonly string[], depth?: number) => {
      const files = baseSys.readDirectory(dirPath, extensions, excludes, includes, depth)
      if (!extensions || extensions.some(ext => ext.includes('.d.ts') || ext.includes('.ts'))) {
        const sparqlFiles = baseSys.readDirectory(dirPath, ['.rq', '.ru'], excludes, includes, depth)
        const virtualFiles = sparqlFiles.map(f => f.replace(/\.r([qu])$/, '.d.r$1.ts'))
        return Array.from(new Set([...files, ...virtualFiles]))
      }
      return files
    },
    watchFile: baseSys.watchFile
      ? (filePath: string, callback: ts.FileWatcherCallback, pollingInterval?: number, watchOptions?: ts.WatchOptions) => {
        if (virtualDts.test(filePath)) {
          return baseSys.watchFile!(
            toSourcePath(filePath),
            (name, kind, mtime) => {
              cache.delete(filePath)
              callback(filePath, kind, mtime)
            },
            pollingInterval,
            watchOptions,
          )
        }
        return baseSys.watchFile!(filePath, callback, pollingInterval, watchOptions)
      }
      : undefined,
    watchDirectory: baseSys.watchDirectory
      ? (dirPath: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, watchOptions?: ts.WatchOptions) => {
        return baseSys.watchDirectory!(
          dirPath,
          (fileName: string) => {
            callback(fileName)
            if (/\.r[qu]$/.test(fileName)) {
              const virt = fileName.replace(/\.r([qu])$/, '.d.r$1.ts')
              cache.delete(virt)
              callback(virt)
            }
          },
          recursive,
          watchOptions,
        )
      }
      : undefined,
  }

  return sys
}

export function hasSparqlImports(tsModule: typeof ts, sourceFile: ts.SourceFile): boolean {
  let found = false

  function visit(node: ts.Node) {
    if (found) return
    if (tsModule.isImportDeclaration(node) && tsModule.isStringLiteral(node.moduleSpecifier)) {
      if (/\.r[qu]($|\?)/.test(node.moduleSpecifier.text)) {
        found = true
        return
      }
    }
    if (tsModule.isExportDeclaration(node) && node.moduleSpecifier && tsModule.isStringLiteral(node.moduleSpecifier)) {
      if (/\.r[qu]($|\?)/.test(node.moduleSpecifier.text)) {
        found = true
        return
      }
    }
    if (tsModule.isCallExpression(node)) {
      const isImportOrRequire = node.expression.kind === tsModule.SyntaxKind.ImportKeyword
        || (tsModule.isIdentifier(node.expression) && node.expression.text === 'require')
      if (isImportOrRequire && node.arguments.length > 0 && tsModule.isStringLiteral(node.arguments[0])) {
        if (/\.r[qu]($|\?)/.test((node.arguments[0] as ts.StringLiteral).text)) {
          found = true
          return
        }
      }
    }
    tsModule.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

export function createCopySparqlFiles(
  tsModule: typeof ts,
  baseSys: ts.System = tsModule.sys,
): (programOrBuilder: ts.Program | ts.BuilderProgram | unknown) => void {
  const warnedProjects = new Set<string>()

  return function copySparqlFiles(programOrBuilder: ts.Program | ts.BuilderProgram | unknown) {
    const program: ts.Program | undefined = (programOrBuilder as { getProgram?: () => ts.Program })?.getProgram?.()
      ?? (programOrBuilder as ts.Program | undefined)
    if (!program || typeof program.getSourceFiles !== 'function') return

    const options = program.getCompilerOptions()

    // Check allowArbitraryExtensions warning
    if (!options.allowArbitraryExtensions) {
      const configKey = String(
        options.configFilePath
        ?? program.getRootFileNames().slice().sort().join(';')
        ?? program.getCurrentDirectory()
        ?? 'default',
      )
      if (!warnedProjects.has(configKey)) {
        const hasSparql = program.getSourceFiles().some(sf => !sf.isDeclarationFile && hasSparqlImports(tsModule, sf))
        if (hasSparql) {
          baseSys.write(`[sparqlc-tsc] Warning: 'allowArbitraryExtensions' is not enabled in compiler options. SPARQL imports will not use generated types and will fall back to untyped declarations.${baseSys.newLine}`)
          warnedProjects.add(configKey)
        }
      }
    }

    if (!options.outDir || options.noEmit || options.emitDeclarationOnly) return
    if (options.noEmitOnError && tsModule.getPreEmitDiagnostics(program).some(d => d.category === tsModule.DiagnosticCategory.Error)) return

    const sourceDir = program.getCommonSourceDirectory()
    const normalizedSourceDir = path.resolve(sourceDir).split(path.sep).join('/')

    for (const file of program.getSourceFiles()) {
      if (!virtualDts.test(file.fileName)) continue

      const source = toSourcePath(file.fileName)
      const normalizedSource = path.resolve(source).split(path.sep).join('/')
      const rel = path.relative(normalizedSourceDir, normalizedSource).split(path.sep).join('/')

      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        baseSys.write(`[sparqlc-tsc] Error: SPARQL file '${source}' is outside the common source directory ('${normalizedSourceDir}') and cannot be copied to outDir.${baseSys.newLine}`)
        continue
      }

      const target = path.resolve(options.outDir, rel).split(path.sep).join('/')
      const content = baseSys.readFile(source)
      if (content === undefined || baseSys.readFile(target) === content) continue

      fs.mkdirSync(path.dirname(target), { recursive: true })
      baseSys.writeFile(target, content)
      if (options.listEmittedFiles) {
        baseSys.write(`TSFILE: ${target}${baseSys.newLine}`)
      }
    }
  }
}

export function copySparqlFiles(
  tsModule: typeof ts,
  baseSys: ts.System,
  programOrBuilder: ts.Program | ts.BuilderProgram | unknown,
): void {
  const handler = createCopySparqlFiles(tsModule, baseSys)
  handler(programOrBuilder)
}

export function run(
  args: string[] = process.argv.slice(2),
  tsModule: typeof ts = ts,
  baseSys: ts.System = tsModule.sys,
): void {
  const sys = createSparqlSys(tsModule, baseSys)
  const copyCb = createCopySparqlFiles(tsModule, baseSys)
  tsModule.executeCommandLine(sys, copyCb, args)
}
