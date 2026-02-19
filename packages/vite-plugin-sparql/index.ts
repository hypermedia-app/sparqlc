import {Plugin} from 'vite';
import {compile} from "sparqlc";

export default <Plugin>{
    name: 'vite-plugin-sparql',
    transform(code, id) {
        if (id.endsWith('.rq')) {
            const compiled = compile(code)
            compiled.writeTypes(id)

            return 'export default ' + compiled.code
        }

        return code
    }
}
