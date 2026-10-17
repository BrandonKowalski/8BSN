import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import live from './fixtures/live.json'
import { useLeague } from './useLeague'

const respond = (body: unknown) => ({ ok: true, json: async () => body }) as Response

const finals = {
  season: { year: 2026, type: 2 },
  week: { number: 6 },
  events: (live.events as unknown[]).slice(0, 1),
}

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useLeague', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('refreshes after 60 seconds while a game is live', async () => {
    const fetchMock = vi.fn(async () => respond(live))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLeague())
    await flush()
    expect(result.current).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(59_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes after 15 minutes when every game is final', async () => {
    const fetchMock = vi.fn(async (url: string) => respond(url.includes('?') ? { ...finals, events: [] } : finals))
    vi.stubGlobal('fetch', fetchMock)
    const boards = () => fetchMock.mock.calls.filter(([url]) => !url.includes('?')).length
    const { result } = renderHook(() => useLeague())
    await flush()
    expect(result.current).toHaveLength(1)
    await advance(60_000)
    expect(boards()).toBe(1)
    await advance(840_000 - 1)
    expect(boards()).toBe(1)
    await advance(1)
    expect(boards()).toBe(2)
  })

  it('keeps the last good result when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(live))
      .mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLeague())
    await flush()
    expect(result.current).toHaveLength(3)
    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toHaveLength(3)
  })

  it('stays null when it never succeeds', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLeague())
    await flush()
    expect(result.current).toBeNull()
    await advance(900_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toBeNull()
  })

  it('stops refreshing after unmount', async () => {
    const fetchMock = vi.fn(async () => respond(live))
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderHook(() => useLeague())
    await flush()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    await advance(1_000_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not schedule from a response that lands after unmount', async () => {
    let release: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderHook(() => useLeague())
    unmount()
    release(respond(live))
    await flush()
    expect(vi.getTimerCount()).toBe(0)
  })
})
