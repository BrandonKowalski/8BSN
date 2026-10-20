import type { RecordingData } from '../emu/recorder'

export const SAVE_VERSION = 10

export type SaveMeta = { rom: string; package?: string; version?: number; savedAt: string; sidecar: unknown; frame?: number; recording?: RecordingData | null }
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

const DB_NAME = '8bsn-saves'
const STORE = 'slots'
const key = (slot: number) => `slot-${slot}`

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('blocked'))
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

async function put(path: string, body: BodyInit): Promise<void> {
  const res = await fetch(path, { method: 'PUT', body })
  if (!res.ok) throw new Error(`Saving ${path} failed with ${res.status}`)
}

async function writeDisk(slot: number, save: SaveFile): Promise<void> {
  const { recording, ...rest } = save.meta
  const stored: StoredMeta = recording ? { ...rest, recording: encodeRecording(recording) } : rest
  await put(url(slot, 'state'), save.core as BufferSource)
  await put(url(slot, 'json'), JSON.stringify(stored))
}

async function readDisk(slot: number): Promise<SaveFile | null> {
  const [core, meta] = await Promise.all([fetch(url(slot, 'state')), fetch(url(slot, 'json'))])
  if (!core.ok || !meta.ok) return null
  const { recording, ...rest } = (await meta.json()) as StoredMeta
  return {
    core: new Uint8Array(await core.arrayBuffer()),
    meta: recording ? { ...rest, recording: decodeRecording(recording) } : rest,
  }
}

function copyRecording(recording: RecordingData): RecordingData {
  return {
    origin: recording.origin,
    inputs: new Uint16Array(recording.inputs),
    hashes: new Uint32Array(recording.hashes),
    snaps: recording.snaps.map(([frame, state]) => [frame, new Uint8Array(state)]),
  }
}

function isSaveFile(value: unknown): value is SaveFile {
  return typeof value === 'object' && value !== null && 'core' in value && 'meta' in value && ArrayBuffer.isView(value.core)
}

export async function writeSlot(slot: number, save: SaveFile, mirrorToDisk = import.meta.env.DEV): Promise<void> {
  const versioned: SaveFile = { core: save.core, meta: { ...save.meta, version: SAVE_VERSION } }
  await run('readwrite', (store) => store.put(versioned, key(slot)))
  if (mirrorToDisk) await writeDisk(slot, versioned).catch(() => undefined)
}

export async function readSlot(slot: number, mirrorToDisk = import.meta.env.DEV): Promise<SaveFile | null> {
  const stored = await run<unknown>('readonly', (store) => store.get(key(slot)))
  if (isSaveFile(stored)) {
    const { recording, ...rest } = stored.meta
    return { core: new Uint8Array(stored.core), meta: recording ? { ...rest, recording: copyRecording(recording) } : rest }
  }
  return mirrorToDisk ? readDisk(slot).catch(() => null) : null
}
