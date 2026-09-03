import config from '@tpluscode/eslint-config'
import rdf from 'eslint-plugin-rdf'

export default [
  ...config,
  {
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  {
    ignores: ['**/*.d.ts'],
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
    files: ['packages/sparqlc/moduleTemplate.js'],
    rules: {
      'import/no-extraneous-dependencies': 'warn',
      'no-undef': 'warn',
    },
  },
  ...rdf.configs.recommended,
]
