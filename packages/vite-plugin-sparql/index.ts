import { Plugin } from 'vite';
import { parseDocument } from 'htmlparser2'
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
                const dom = parseDocument(html)
                const $ = load(dom)

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
                return 'export default ' + compile(code)
            }

            return code
        }
    }
}
