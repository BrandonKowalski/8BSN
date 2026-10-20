import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { romStore } from './romStore'

afterEach(async () => {
  vi.unstubAllGlobals()
  await romStore.clear()
})

test('keeps one ROM per game and loads the one in use', async () => {
  expect(await romStore.load()).toBeNull()
  expect(await romStore.save(new Uint8Array([1, 2, 3, 250]), 'aaa')).toBe(true)
  expect(await romStore.save(new Uint8Array([7]), 'bbb')).toBe(true)
  expect(Array.from((await romStore.load())!)).toEqual([7])
  await romStore.select('aaa')
  expect(Array.from((await romStore.load())!)).toEqual([1, 2, 3, 250])
  expect((await romStore.loadAll()).map((bytes) => Array.from(bytes))).toEqual([[1, 2, 3, 250], [7]])
  await romStore.clear()
  expect(await romStore.load()).toBeNull()
  expect(await romStore.loadAll()).toEqual([])
})

test('a ROM saved before per-game storage still loads', async () => {
  const request = indexedDB.open('tecmo-broadcast', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('rom')
  const db = await new Promise<IDBDatabase>((resolve) => (request.onsuccess = () => resolve(request.result)))
  await new Promise<void>((resolve) => {
    const tx = db.transaction('rom', 'readwrite')
    tx.objectStore('rom').put(new Uint8Array([5, 5]), 'current')
    tx.oncomplete = () => resolve()
  })
  db.close()
  expect(Array.from((await romStore.load())!)).toEqual([5, 5])
  expect((await romStore.loadAll()).map((bytes) => Array.from(bytes))).toEqual([[5, 5]])
  await romStore.remove('legacy')
  expect(await romStore.load()).toBeNull()
})

test('removing a game forgets it and, when it was in use, the active choice', async () => {
  await romStore.save(new Uint8Array([1]), 'aaa')
  await romStore.save(new Uint8Array([2]), 'bbb')
  await romStore.remove('aaa')
  expect(Array.from((await romStore.load())!)).toEqual([2])
  await romStore.remove('bbb')
  expect(await romStore.load()).toBeNull()
  expect(await romStore.loadAll()).toEqual([])
})

test('resolves without rejecting when indexedDB is undefined', async () => {
  vi.stubGlobal('indexedDB', undefined)
  expect(await romStore.save(new Uint8Array([1]), 'aaa')).toBe(false)
  expect(await romStore.load()).toBeNull()
  expect(await romStore.loadAll()).toEqual([])
  await expect(romStore.select('aaa')).resolves.toBeUndefined()
  await expect(romStore.clear()).resolves.toBeUndefined()
})

test('resolves without rejecting when indexedDB throws', async () => {
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('blocked')
    },
  })
  expect(await romStore.save(new Uint8Array([1]), 'aaa')).toBe(false)
  expect(await romStore.load()).toBeNull()
  await expect(romStore.clear()).resolves.toBeUndefined()
})
