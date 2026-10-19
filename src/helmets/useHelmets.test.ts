import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TSB2026 } from '../rom/profiles'
import { helmetStore } from './helmetStore'
import { useHelmets } from './useHelmets'

vi.mock('../game/roster', async (importOriginal) => ({ ...(await importOriginal<typeof import('../game/roster')>()), parseRoster: () => [{ id: 0 }, { id: 5 }] }))

const ROM = { bytes: new Uint8Array([1]), profile: TSB2026 }

const { createObjectURL, revokeObjectURL } = URL

beforeEach(() => {
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:${++n}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('cached helmets become image URLs keyed by team id without starting a worker', async () => {
  vi.spyOn(helmetStore, 'load').mockResolvedValue({ 0: new Blob(['a']), 5: new Blob(['b']) })
  const worker = vi.fn()
  vi.stubGlobal('Worker', worker)
  const { result } = renderHook(() => useHelmets(ROM))
  await waitFor(() => expect(result.current.size).toBe(2))
  expect(result.current.get(0)).toMatch(/^blob:/)
  expect(result.current.get(5)).toMatch(/^blob:/)
  expect(worker).not.toHaveBeenCalled()
})

test('without a ROM there are no helmets', () => {
  const { result } = renderHook(() => useHelmets(null))
  expect(result.current.size).toBe(0)
})

test('a cache miss extracts in a worker and saves the result', async () => {
  vi.spyOn(helmetStore, 'load').mockResolvedValue(null)
  const save = vi.spyOn(helmetStore, 'save').mockResolvedValue()
  const posted: unknown[] = []
  class FakeWorker {
    listeners: Record<string, (event: unknown) => void> = {}
    addEventListener(type: string, fn: (event: unknown) => void) {
      this.listeners[type] = fn
    }
    postMessage(message: unknown) {
      posted.push(message)
      queueMicrotask(() => this.listeners.message({ data: { ok: true, helmets: [[5, new Blob(['b'])]] } }))
    }
    terminate = vi.fn()
  }
  vi.stubGlobal('Worker', FakeWorker)
  const { result } = renderHook(() => useHelmets(ROM))
  await waitFor(() => expect(result.current.size).toBe(1))
  expect(posted[0]).toMatchObject({ teamIds: [0, 5] })
  expect(save).toHaveBeenCalled()
})
