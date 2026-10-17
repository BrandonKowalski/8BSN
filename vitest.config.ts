import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/emu/core/**'],
          setupFiles: ['src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/emu/core/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,tsx}', 'vite.config.test.ts'],
        },
      },
    ],
  },
})
