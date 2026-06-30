// Flat config for ESLint v9+ / v10. The repo ships @typescript-eslint's parser
// + plugin (v8); this wires them (and eslint-plugin-react-hooks) into a flat
// config directly.
//
// Scope: src/** only. Ignores cover build output, deps, macOS AppleDouble
// resource forks (`._*` — created on exFAT volumes and not valid source), and
// the generated inkjs runtime.
//
// Pragmatic relaxations that fit this codebase:
//   - no-explicit-any: off  — `any` is deliberate at the Electron IPC / JSON
//     boundaries (main + preload) where payloads are shuttled as JSON.
//   - no-unused-vars: warn  — surfaces unused vars without failing the build.
import parser from '@typescript-eslint/parser'
import tseslint from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'

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
  }
]
