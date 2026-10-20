import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { readSlot, SAVE_VERSION, writeSlot } from './saveSlots'

const SIDECAR = { tracker: { plays: [{ index: 0 }] }, lastInGame: null }
const RECORDING = {
  origin: 1200,
  inputs: new Uint16Array([1, 65535]),
  hashes: new Uint32Array([0xdeadbeef]),
  snaps: [[1201, new Uint8Array([9, 8, 7])]] as [number, Uint8Array][],
}
const save = { core: new Uint8Array([1, 2, 3]), meta: { rom: 'abc', savedAt: '', sidecar: SIDECAR, frame: 1202, recording: RECORDING } }

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('no dev server'))))
})

afterEach(() => vi.unstubAllGlobals())

test('a hosted build saves and loads slots from browser storage without touching the network', async () => {
  await writeSlot(2, save, false)
  const loaded = await readSlot(2, false)
  expect(fetch).not.toHaveBeenCalled()
  expect(loaded?.core).toEqual(save.core)
  expect(loaded?.meta).toMatchObject({ rom: 'abc', frame: 1202, version: SAVE_VERSION, sidecar: SIDECAR })
  expect(loaded?.meta.recording?.inputs).toBeInstanceOf(Uint16Array)
  expect(Array.from(loaded!.meta.recording!.snaps[0][1])).toEqual([9, 8, 7])
})

test('an empty slot reads as nothing', async () => {
  expect(await readSlot(3, false)).toBeNull()
})

test('the dev mirror failing does not fail the save', async () => {
  await writeSlot(1, save, true)
  expect(fetch).toHaveBeenCalled()
  expect((await readSlot(1, true))?.meta.rom).toBe('abc')
})

test('slots are kept apart', async () => {
  await writeSlot(1, save, false)
  await writeSlot(4, { ...save, meta: { ...save.meta, rom: 'xyz' } }, false)
  expect((await readSlot(1, false))?.meta.rom).toBe('abc')
  expect((await readSlot(4, false))?.meta.rom).toBe('xyz')
})
