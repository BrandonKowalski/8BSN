import type { GameSidecar } from '../game/useGame'

export type SaveMeta = { rom: string; savedAt: string; sidecar: GameSidecar }
export type SaveFile = { core: Uint8Array; meta: SaveMeta }

const url = (slot: number, ext: 'state' | 'json') => `/__states/slot-${slot}.${ext}`

async function put(path: string, body: BodyInit): Promise<void> {
  const res = await fetch(path, { method: 'PUT', body })
  if (!res.ok) throw new Error(`Saving ${path} failed with ${res.status}`)
}

export async function writeSlot(slot: number, save: SaveFile): Promise<void> {
  await put(url(slot, 'state'), save.core as BufferSource)
  await put(url(slot, 'json'), JSON.stringify(save.meta))
}

export async function readSlot(slot: number): Promise<SaveFile | null> {
  const [core, meta] = await Promise.all([fetch(url(slot, 'state')), fetch(url(slot, 'json'))])
  if (!core.ok || !meta.ok) return null
  return { core: new Uint8Array(await core.arrayBuffer()), meta: (await meta.json()) as SaveMeta }
}
