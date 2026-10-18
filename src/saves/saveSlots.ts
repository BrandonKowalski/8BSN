import type { RecordingData } from '../emu/recorder'
import type { GameSidecar } from '../game/useGame'

export const SAVE_VERSION = 9

export type SaveMeta = { rom: string; version?: number; savedAt: string; sidecar: GameSidecar; frame?: number; recording?: RecordingData | null }
export type SaveFile = { core: Uint8Array; meta: SaveMeta }

type StoredRecording = { origin: number; inputs: string; hashes: string; snaps: [number, string][] }
type StoredMeta = Omit<SaveMeta, 'recording'> & { recording?: StoredRecording | null }

const url = (slot: number, ext: 'state' | 'json') => `/__states/slot-${slot}.${ext}`

const CHUNK = 0x8000

function toBase64(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  let text = ''
  for (let i = 0; i < bytes.length; i += CHUNK) text += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function encodeRecording(recording: RecordingData): StoredRecording {
  return {
    origin: recording.origin,
    inputs: toBase64(recording.inputs),
    hashes: toBase64(recording.hashes),
    snaps: recording.snaps.map(([frame, state]) => [frame, toBase64(state)]),
  }
}

function decodeRecording(stored: StoredRecording): RecordingData {
  return {
    origin: stored.origin,
    inputs: new Uint16Array(fromBase64(stored.inputs).buffer),
    hashes: new Uint32Array(fromBase64(stored.hashes).buffer),
    snaps: stored.snaps.map(([frame, state]) => [frame, fromBase64(state)]),
  }
}

async function put(path: string, body: BodyInit): Promise<void> {
  const res = await fetch(path, { method: 'PUT', body })
  if (!res.ok) throw new Error(`Saving ${path} failed with ${res.status}`)
}

export async function writeSlot(slot: number, save: SaveFile): Promise<void> {
  const { recording, ...rest } = save.meta
  const versioned = { ...rest, version: SAVE_VERSION }
  const stored: StoredMeta = recording ? { ...versioned, recording: encodeRecording(recording) } : versioned
  await put(url(slot, 'state'), save.core as BufferSource)
  await put(url(slot, 'json'), JSON.stringify(stored))
}

export async function readSlot(slot: number): Promise<SaveFile | null> {
  const [core, meta] = await Promise.all([fetch(url(slot, 'state')), fetch(url(slot, 'json'))])
  if (!core.ok || !meta.ok) return null
  const { recording, ...rest } = (await meta.json()) as StoredMeta
  return {
    core: new Uint8Array(await core.arrayBuffer()),
    meta: recording ? { ...rest, recording: decodeRecording(recording) } : rest,
  }
}
