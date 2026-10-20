import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { sharedTestConfig } from './vitest.shared.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(sharedTestConfig, defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'packages/**/*.test.{ts,tsx}',
      'apps/**/adapters/**/*.test.ts',
      'web-worker/**/*.test.ts',
      'eslint-rules/**/*.test.js',
      // The harness modules in `bin/` carry rules of their own — the worktree
      // app port, the dev environment, the port collision guard.
      'bin/**/*.test.ts',
    ],
    exclude: [
      ...configDefaults.exclude,
      "**/*.runtime.test.ts",
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
