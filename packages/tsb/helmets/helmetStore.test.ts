import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { helmetStore } from './helmetStore'

afterEach(() => vi.unstubAllGlobals())

test('round-trips helmet sets per ROM', async () => {
  expect(await helmetStore.load('abc')).toBeNull()
  await helmetStore.save('abc', { 0: new Blob(['x']), 5: new Blob(['y']) })
  const loaded = await helmetStore.load('abc')
  expect(Object.keys(loaded!).sort()).toEqual(['0', '5'])
  expect(await helmetStore.load('other')).toBeNull()
})

test('resolves quietly when indexedDB is missing', async () => {
  vi.stubGlobal('indexedDB', undefined)
  await expect(helmetStore.save('abc', {})).resolves.toBeUndefined()
  expect(await helmetStore.load('abc')).toBeNull()
})
