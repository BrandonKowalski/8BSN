import { bootCore } from '@8bsn/sdk/core'
import { extractHelmets, type HelmetArt, type HelmetTeam } from './extract'

export type HelmetRequest = { rom: Uint8Array; teams: HelmetTeam[]; art: HelmetArt }
export type HelmetImages = { right: Blob; left: Blob }
export type HelmetReply = { ok: true; helmets: [number, HelmetImages][] } | { ok: false; message: string }

async function toPng(helmet: { width: number; height: number; data: Uint8ClampedArray }): Promise<Blob> {
  const canvas = new OffscreenCanvas(helmet.width, helmet.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(helmet.data), helmet.width, helmet.height), 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

self.addEventListener('message', async (event: MessageEvent<HelmetRequest>) => {
  try {
    const core = await bootCore()
    const helmets = extractHelmets(core, event.data.rom, event.data.teams, event.data.art)
    const encoded = await Promise.all(
      [...helmets].map(async ([id, { right, left }]) => [id, { right: await toPng(right), left: await toPng(left) }] as [number, HelmetImages]),
    )
    self.postMessage({ ok: true, helmets: encoded } satisfies HelmetReply)
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) } satisfies HelmetReply)
  }
})
