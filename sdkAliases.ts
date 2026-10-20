import { fileURLToPath } from 'node:url'

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export const sdkAliases = {
  '@8bsn/sdk/core': at('./src/sdk/core.ts'),
  '@8bsn/sdk/testing': at('./src/sdk/testing.tsx'),
  '@8bsn/sdk': at('./src/sdk/index.ts'),
}
