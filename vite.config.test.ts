import { expect, test } from 'vitest'
import config from './vite.config'

test('dev and preview servers are cross-origin isolated', () => {
  for (const headers of [config.server?.headers, config.preview?.headers]) {
    expect(headers?.['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers?.['Cross-Origin-Embedder-Policy']).toBe('require-corp')
  }
})
