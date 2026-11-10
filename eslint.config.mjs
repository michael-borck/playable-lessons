// Flat config for ESLint v9+ / v10. The repo ships @typescript-eslint's parser
// + plugin (v8); this wires them (and eslint-plugin-react-hooks) into a flat
// config directly.
//
// Scope: src/** (TypeScript/TSX) plus server/, scripts/, and docs/ (plain
// JS/MJS). Ignores cover build output, deps, macOS AppleDouble resource forks
// (`._*` — created on exFAT volumes and not valid source), and the generated
// inkjs runtime.
//
// Pragmatic relaxations that fit this codebase:
//   - no-explicit-any: off  — `any` is deliberate at the Electron IPC / JSON
//     boundaries (main + preload) where payloads are shuttled as JSON.
//   - no-unused-vars: warn  — surfaces unused vars without failing the build.
import parser from '@typescript-eslint/parser'
import tseslint from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

// Minimal explicit globals so no-undef works without pulling in the `globals`
// package. Add names here when a file legitimately needs another host global.
const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  exports: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  __dirname: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly'
}

const browserGlobals = {
  Blob: 'readonly',
  FileReader: 'readonly',
  URL: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly'
}

const vitestGlobals = {
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly'
}

export default [
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      '**/._*',
      'src/shared/inkRuntime.generated.ts'
    ]
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module'
      }
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['server/**/*.js', 'scripts/**/*.js'],
    ignores: ['server/**/*.test.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: nodeGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['server/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...nodeGlobals, ...vitestGlobals }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: nodeGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['docs/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: browserGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
]
