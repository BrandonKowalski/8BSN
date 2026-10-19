import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { romStore } from './romStore'

afterEach(async () => {
  vi.unstubAllGlobals()
  await romStore.clear()
})

test('round-trips bytes and returns null after clear', async () => {
  expect(await romStore.load()).toBeNull()
  expect(await romStore.save(new Uint8Array([1, 2, 3, 250]))).toBe(true)
  expect(Array.from((await romStore.load())!)).toEqual([1, 2, 3, 250])
  await romStore.clear()
  expect(await romStore.load()).toBeNull()
})

test('resolves without rejecting when indexedDB is undefined', async () => {
  vi.stubGlobal('indexedDB', undefined)
  expect(await romStore.save(new Uint8Array([1]))).toBe(false)
  expect(await romStore.load()).toBeNull()
  await expect(romStore.clear()).resolves.toBeUndefined()
})

test('resolves without rejecting when indexedDB throws', async () => {
  vi.stubGlobal('indexedDB', {
    open: () => {
      throw new Error('blocked')
    },
  })
  expect(await romStore.save(new Uint8Array([1]))).toBe(false)
  expect(await romStore.load()).toBeNull()
  await expect(romStore.clear()).resolves.toBeUndefined()
})
