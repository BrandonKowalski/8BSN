import createCore from '../emu/core/tb_core.mjs'
import wasmUrl from '../emu/core/tb_core.wasm?url'
import { extractHelmets } from './extract'

export type HelmetRequest = { rom: Uint8Array; teamIds: number[] }
export type HelmetReply = { ok: true; helmets: [number, Blob][] } | { ok: false; message: string }

async function toPng(helmet: { width: number; height: number; data: Uint8ClampedArray }): Promise<Blob> {
  const canvas = new OffscreenCanvas(helmet.width, helmet.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(helmet.data), helmet.width, helmet.height), 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

self.addEventListener('message', async (event: MessageEvent<HelmetRequest>) => {
  try {
    const core = await createCore({ locateFile: () => wasmUrl })
    const helmets = extractHelmets(core, event.data.rom, event.data.teamIds)
    const encoded = await Promise.all([...helmets].map(async ([id, helmet]) => [id, await toPng(helmet)] as [number, Blob]))
    self.postMessage({ ok: true, helmets: encoded } satisfies HelmetReply)
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) } satisfies HelmetReply)
  }
})
