import { Plugin } from 'vite';
import { parse } from 'parse5'
import { load } from 'cheerio'
import { sparqlToMetaScript } from './sparqlToMetaScript.js';
import {compile} from "sparqlc";
import * as fs from "node:fs";

export function selectMeta(endpoint: string): Plugin {
    return {
        name: 'vite-plugin-sparql-select-meta',
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                //const dom = parse(html)
                const $ = load(html)

                const metaScriptSrc = ctx.filename + '.meta.rq'
                if (fs.existsSync(metaScriptSrc)) {
                    const metaScript = sparqlToMetaScript(fs.readFileSync(metaScriptSrc).toString(), endpoint)

                    $('head').append(`<script type="module" ssr>${metaScript}</script>`)
                }

                return $.html()
            }
        },
        transform(code, id) {
            if (id.endsWith('.rq')) {
                const compiled = compile(code)
                let returnType: string
                switch (compiled.queryType) {
                    case 'SELECT':
                        returnType = '{}'
                        break
                    case 'CONSTRUCT':
                    case 'DESCRIBE':
                        returnType = 'Stream'
                        break
                    case 'ASK':
                        returnType = 'boolean'
                        break
                    case "UPDATE":
                        returnType = 'void'
                        break
                    default:
                       returnType = 'unknown'
                }

                fs.writeFileSync(id+'.d.ts', `import {QueryExecutor} from "sparqlc";
import {Stream} from "@rdfjs/types";

declare const query: QueryExecutor<${returnType}>
export default query
`)

                return 'export default ' + compiled.code
            }

            return code
        }
    }
}
