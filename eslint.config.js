import path from 'node:path'
import { includeIgnoreFile } from 'eslint/config'
import config from '@tpluscode/eslint-config'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { createNodeResolver } from 'eslint-plugin-import-x'

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  ...config,
  {
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
        }),
        createNodeResolver(),
      ],
    },
  },
  {
    ignores: [
      'packages/esbuild-plugin-sparql/test/out/',
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      indent: 'off',
    },
  },
  {
    files: ['**/*.{ts,mts,cts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['packages/sparqlc/moduleTemplate.js'],
    rules: {
      'import-x/no-extraneous-dependencies': 'warn',
      'no-undef': 'off',
    },
  },
  {
    files: ['packages/sparqlc/*.js'],
    rules: {
      'n/no-missing-import': 'off',
    },
  },
  {
    files: ['packages/node-loader-sparql/index.ts'],
    rules: {
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: [
      'packages/*/test/**',
      'packages/*/mocha-setup.js',
      'packages/vite-plugin-sparql/vitest.config.ts',
    ],
    rules: {
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
]
