import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { statesPlugin } from './tools/statesPlugin.ts'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), statesPlugin()],
  worker: { format: 'es' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
})
