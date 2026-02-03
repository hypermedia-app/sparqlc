import {StreamClient} from "sparql-http-client";
import TermMap from "@rdfjs/term-map";
import rdf from "@rdfjs/data-model";
import {Params, Env} from "./index.js";
import {Term} from "@rdfjs/types";

export function isEnv(arg: Env | unknown): arg is Env {
    return typeof arg === 'object' && arg !== null && 'dataset' in arg && typeof arg.dataset === 'function'
}

export function toTermMap(map: Map<Term, Term | Term[]>, params: Params): Map<Term, Term | Term[]> {
    if (params instanceof URLSearchParams) {
        for (const [key, value] of params.entries()) {
            map.set(rdf.literal(key), rdf.literal(value))
        }
    } else if (Symbol.iterator in params) {
        for (const [key, value] of params.entries()) {
            map.set(key, value)
        }
    } else {
        for (const key of Object.keys(params)) {
            map.set(rdf.literal(key), params[key])
        }
    }

    return map
}
