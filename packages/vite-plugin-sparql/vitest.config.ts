/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import SparqlPlugin from './index.js'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
  plugins: [
    SparqlPlugin,
  ],
  optimizeDeps: {
    include: [
      '@rdfjs/term-map',
      'sparqljs',
      '@rdfjs/data-model',
      '@zazuko/prefixes',
      '@hydrofoil/sparql-processor',
    ],
  },
})
