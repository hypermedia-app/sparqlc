import {compile} from "../index.js";
import * as fs from "node:fs";
import $rdf from "@zazuko/env";
import { stringToTerm } from 'rdf-string'

// read query from file path (first CLI param)
const filePath = process.argv[2];
if (!filePath) {
    console.error("Usage: sparqlc <path-to-query-file>");
    process.exit(2);
}

// collect the rest of the CLI params as bindings
const bindings = process.argv.slice(3)
    .map(binding => {
        const [name, value] = binding.split("=");
        return [name, stringToTerm(value)]
    });

const query = fs.readFileSync(filePath, "utf8");
const result = compile(query);
console.log(await result.execute(Object.fromEntries(bindings), $rdf));
