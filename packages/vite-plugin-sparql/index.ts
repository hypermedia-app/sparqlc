import { Plugin } from 'vite';
import { parseDocument } from 'htmlparser2'
import { load } from 'cheerio'
import { sparqlToMetaScript } from './sparqlToMetaScript.js';

export function selectMeta(endpoint: string): Plugin {
    return {
        name: 'vite-plugin-sparql-select-meta',
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                const dom = parseDocument(html)
                const $ = load(dom)

                $('script[type="application/sparql-query"][meta]:not([src])').each((_, el) => {
                    const metaScript = sparqlToMetaScript($(el).text(), endpoint)
                    const scriptTag = `<script type="module" ssr>${metaScript}</script>`

                    $(el).replaceWith(scriptTag)
                })

                return $.html()
            }
        }
    }
}
