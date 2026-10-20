import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
          exclude: ['src/emu/core/**', 'src/**/*.node.test.ts', 'packages/**/*.node.test.ts'],
          setupFiles: ['src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/emu/core/**/*.test.{ts,tsx}', 'src/**/*.node.test.ts', 'packages/**/*.node.test.ts', 'packages/**/tools/**/*.test.ts', 'tools/**/*.test.{ts,tsx}', 'vite.config.test.ts'],
        },
      },
    ],
  },
})
