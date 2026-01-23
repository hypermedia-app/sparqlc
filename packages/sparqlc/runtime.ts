import {StreamClient} from "sparql-http-client";
import TermMap from "@rdfjs/term-map";
import rdf from "@rdfjs/data-model";
import {Params, Env} from "./index.js";
import {Term} from "@rdfjs/types";

export function isEnv(arg: Env | unknown): arg is Env {
    return typeof arg === 'object' && arg !== null && 'dataset' in arg && typeof arg.dataset === 'function'
}

export function isClient(arg: StreamClient | unknown): arg is StreamClient {
    return typeof arg === 'object' && arg !== null && 'query' in arg && typeof arg.query === 'object'
}

export function toTermMap(map: Map<string, Term>, params: Params): Map<string, Term> {
    if (params instanceof URLSearchParams) {
        for (const [key, value] of params.entries()) {
            map.set(key, rdf.literal(value))
        }
    } else if (Symbol.iterator in params) {
        for (const [key, value] of params.entries()) {
            map.set(key.value, value)
        }
    } else {
        for (const key of Object.keys(params)) {
            map.set(key, params[key])
        }
    }

    return map
}
