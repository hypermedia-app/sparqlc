/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('node:path')
const { compile } = require('sparqlc')

const projects = new Map()

function init(modules) {
  const ts = modules.typescript

  function create(info) {
    const log = (msg) => {
      if (info.project && info.project.projectService && info.project.projectService.logger) {
        info.project.projectService.logger.info(`[ts-plugin-sparqlc] ${msg}`)
      }
    }

    log('Plugin initialized (virtual types mode)')
    projects.set(info.project.getProjectName(), info)

    // In-memory virtual files cache: key = virtual d.ts path, value = { content, version, sourceVersion, sourcePath }
    const virtualFiles = new Map()

    function toVirtualPath(rqPath) {
      // Use the standard allowArbitraryExtensions naming: styles.css -> styles.d.css.ts
      // Preserve extension for .rq and .ru: foo.rq -> foo.d.rq.ts, foo.ru -> foo.d.ru.ts
      return rqPath.replace(/\.r([qu])$/, '.d.r$1.ts')
    }

    function buildDtsContent(rqSource) {
      if (!compile) {
        log('Error: sparqlc.compile is not available. Please ensure sparqlc is built.')
        return 'export {}'
      }
      try {
        const compiled = compile(rqSource, {
          base: 'http://example.org/',
        })
        const queryType = compiled.returnType === 'unknown'
          ? 'unknown'
          : `sparqlc.Execute${compiled.returnType}`

        let bindingsType = ''
        if (queryType.startsWith('sparqlc.ExecuteSelect')) {
          bindingsType = `export type Bindings = ${queryType} extends sparqlc.ExecuteSelect<infer B> ? B : never;`
        }

        return `import type * as sparqlc from "sparqlc";
${bindingsType}
declare const _default: ${queryType}
export default _default
`
      } catch (e) {
        log(`Compile error: ${e.message}`)
        return 'export {}'
      }
    }

    const host = info.languageServiceHost
    const project = info.project
    const serverHost = project && project.projectService && project.projectService.host

    const origGetScriptSnapshot = host.getScriptSnapshot && host.getScriptSnapshot.bind(host)
    const origGetScriptVersion = host.getScriptVersion && host.getScriptVersion.bind(host)
    const origReadFile = host.readFile && host.readFile.bind(host)
    const origFileExists = host.fileExists && host.fileExists.bind(host)

    // Patch the server host as well, so ProjectService knows virtual files exist
    if (serverHost) {
      const origServerFileExists = serverHost.fileExists && serverHost.fileExists.bind(serverHost)
      if (origServerFileExists) {
        serverHost.fileExists = (fileName) => {
          if (virtualFiles.has(fileName)) return true
          return origServerFileExists(fileName)
        }
      }
      const origServerReadFile = serverHost.readFile && serverHost.readFile.bind(serverHost)
      if (origServerReadFile) {
        serverHost.readFile = (fileName) => {
          const cached = virtualFiles.get(fileName)
          if (cached) return cached.content
          return origServerReadFile(fileName)
        }
      }
    }

    const getExternalFiles = () => {
      // Return all virtual files we've encountered so far for this project
      const virtualPaths = Array.from(virtualFiles.keys())
      if (virtualPaths.length > 0) {
        log(`getExternalFiles: ${virtualPaths.join(', ')}`)
      }
      return virtualPaths
    }

    const resolvePath = (containingFile, spec) => {
      const dir = path.dirname(containingFile)
      const absRq = path.resolve(dir, spec.replace(/\.js$/, ''))
      return absRq
    }

    const ensureVirtualFromSource = (absRqPath) => {
      if (!/\.r[qu]$/.test(absRqPath)) return undefined
      const vPath = toVirtualPath(absRqPath)

      // Use the host's snapshot if it exists (for current buffer content), else read from disk via host
      const snapshot = origGetScriptSnapshot && origGetScriptSnapshot(absRqPath)
      let source
      if (snapshot) {
        source = snapshot.getText(0, snapshot.getLength())
      } else if (origReadFile) {
        source = origReadFile(absRqPath)
      }

      if (source === undefined) {
        log(`Source file not found for virtual types: ${absRqPath}`)
        return undefined
      }

      const sourceVersion = origGetScriptVersion ? origGetScriptVersion(absRqPath) : '0'
      const cached = virtualFiles.get(vPath)

      if (!cached || cached.sourceVersion !== sourceVersion) {
        const content = buildDtsContent(source)
        const vVersion = (cached ? parseInt(cached.version, 10) + 1 : 1).toString()
        virtualFiles.set(vPath, {
          content,
          version: vVersion,
          sourceVersion,
          sourcePath: absRqPath,
        })
        log(`Updated virtual types for ${absRqPath} (vPath: ${vPath}) - source version: ${sourceVersion}`)

        // Ensure the virtual file exists as a ScriptInfo in the ProjectService
        if (info.project && info.project.projectService) {
          try {
            const projectService = info.project.projectService
            // This creates the ScriptInfo if it doesn't exist, preventing the Debug Failure in setDocument
            const result = projectService.getOrCreateScriptInfoNotOpenedByClient(
              vPath,
              projectService.host.getCurrentDirectory(),
              projectService.host,
            )
            const scriptInfo = projectService.getScriptInfo(vPath)
            if (scriptInfo) {
              scriptInfo.setOptions({ scriptKind: ts.ScriptKind.TS })
              log(`Registered ScriptInfo for ${vPath}`)
            } else {
              log(`Failed to create ScriptInfo for ${vPath} (result: ${result})`)
            }
          } catch (e) {
            log(`Exception during ScriptInfo registration: ${e.message}`)
          }
          info.project.markAsDirty()
        }
      }
      return vPath
    }

    // Wrap resolution to redirect .rq/.ru imports to our virtual d.ts
    const origResolveModuleNameLiterals = host.resolveModuleNameLiterals && host.resolveModuleNameLiterals.bind(host)
    if (origResolveModuleNameLiterals) {
      host.resolveModuleNameLiterals = (moduleLiterals, containingFile, redirectedReference, options, ...rest) => {
        const resolutions = origResolveModuleNameLiterals(moduleLiterals, containingFile, redirectedReference, options, ...rest)
        return resolutions.map((res, i) => {
          const lit = moduleLiterals[i]
          const spec = lit && lit.text
          if (spec && (/\.r[qu]$/.test(spec) || /\.r[qu]\.js$/.test(spec))) {
            const absRq = resolvePath(containingFile, spec)
            const vPath = ensureVirtualFromSource(absRq)
            if (vPath) {
              return {
                resolvedModule: {
                  resolvedFileName: vPath,
                  extension: ts.Extension.Dts,
                  isExternalLibraryImport: false,
                },
              }
            }
          }
          return res
        })
      }
    }

    const origResolveModuleNames = host.resolveModuleNames && host.resolveModuleNames.bind(host)
    if (origResolveModuleNames) {
      host.resolveModuleNames = (moduleNames, containingFile, ...rest) => {
        const resolutions = origResolveModuleNames(moduleNames, containingFile, ...rest)
        return moduleNames.map((spec, i) => {
          const specName = typeof spec === 'string' ? spec : (spec && spec.text)
          if (specName && (/\.r[qu]$/.test(specName) || /\.r[qu]\.js$/.test(specName))) {
            const absRq = resolvePath(containingFile, specName)
            const vPath = ensureVirtualFromSource(absRq)
            if (vPath) {
              return {
                resolvedFileName: vPath,
                extension: ts.Extension.Dts,
                isExternalLibraryImport: false,
              }
            }
          }
          return resolutions[i]
        })
      }
    }

    // Host patches to serve virtual files
    if (origGetScriptSnapshot) {
      host.getScriptSnapshot = (fileName) => {
        if (/\.d\.r[qu]\.ts$/.test(fileName)) {
          const cached = virtualFiles.get(fileName)
          if (cached) return ts.ScriptSnapshot.fromString(cached.content)

          // If not in cache, try to derive it from the source .rq file
          const rqPath = fileName.replace(/\.d\.r([qu])\.ts$/, '.r$1')
          if (ensureVirtualFromSource(rqPath)) {
            const retryCached = virtualFiles.get(fileName)
            if (retryCached) return ts.ScriptSnapshot.fromString(retryCached.content)
          }
        }
        if (/\.r[qu]$/.test(fileName)) {
          ensureVirtualFromSource(fileName)
          // Always return the snapshot for the .rq file itself
          return origGetScriptSnapshot(fileName)
        }
        return origGetScriptSnapshot(fileName)
      }
    }

    if (origGetScriptVersion) {
      host.getScriptVersion = (fileName) => {
        if (/\.d\.r[qu]\.ts$/.test(fileName)) {
          const cached = virtualFiles.get(fileName)
          if (cached) return cached.version

          const rqPath = fileName.replace(/\.d\.r([qu])\.ts$/, '.r$1')
          if (ensureVirtualFromSource(rqPath)) {
            const retryCached = virtualFiles.get(fileName)
            if (retryCached) return retryCached.version
          }
        }
        if (/\.r[qu]$/.test(fileName)) ensureVirtualFromSource(fileName)
        return origGetScriptVersion(fileName)
      }
    }

    if (origFileExists) {
      host.fileExists = (fileName) => {
        if (virtualFiles.has(fileName)) return true
        return origFileExists(fileName)
      }
    }

    if (origReadFile) {
      host.readFile = (fileName) => {
        const cached = virtualFiles.get(fileName)
        if (cached) return cached.content
        return origReadFile(fileName)
      }
    }

    const origGetScriptKind = host.getScriptKind && host.getScriptKind.bind(host)
    if (origGetScriptKind) {
      host.getScriptKind = (fileName) => {
        if (virtualFiles.has(fileName)) return ts.ScriptKind.TS
        return origGetScriptKind(fileName)
      }
    }

    info.getExternalFiles = getExternalFiles

    return info.languageService
  }

  return {
    create,
    getExternalFiles: (project) => {
      const info = projects.get(project.getProjectName())
      if (info && info.getExternalFiles) {
        return info.getExternalFiles()
      }
      return []
    },
  }
}

init.default = init
module.exports = init
