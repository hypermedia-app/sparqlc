import type {LoadHook} from 'node:module';
import {compile} from "sparqlc";

export const load: LoadHook = async (url, context, nextLoad) => {
    if (url.endsWith('rq')) {
        const {source} = await nextLoad(url, {...context, format: 'module'});
        return {
            format: 'module',
            source: 'export default ' + compile(source!.toString()),
        };
    }

    if (url.endsWith('inline')) {
        const {source} = await nextLoad(url, {...context, format: 'module'});
        return {
            format: 'module',
            source: `export default \`${source!.toString()}\`;`,
        }
    }

    return nextLoad(url, context);
}
