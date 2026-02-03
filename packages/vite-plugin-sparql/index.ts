import { Plugin } from 'vite';
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
                compiled.writeTypes(id)

                return 'export default ' + compiled.code
            }

            return code
        }
    }
}
