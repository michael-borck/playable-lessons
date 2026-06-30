import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Exclude macOS AppleDouble resource forks (`._*`) — on exFAT volumes every
    // file write creates a `._` twin, and these binary forks fail to parse.
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/._*']
  }
})
