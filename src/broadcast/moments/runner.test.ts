import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../../emu/Emulator'
import type { Clip } from '../../emu/recorder'
import { ReplayPlayer, type ReplayEnd } from '../../emu/ReplayPlayer'
import type { GraphicCall, ReplayCall } from '../../sdk/types'
import { LEAD_IN_MS, LEAD_OUT_MS } from './ReplayLeadIn'
import { REPLAY_HOLD_MS, REPLAY_SPEED, useClipRunner, useReel } from './runner'

vi.mock('../../emu/ReplayPlayer', () => ({ ReplayPlayer: { start: vi.fn() } }))

class FakePlayer {
  private readonly listeners = new Set<(reason: ReplayEnd) => void>()
  readonly stop = vi.fn(() => this.end('stopped'))
  private ended: ReplayEnd | null = null

  onEnd(listener: (reason: ReplayEnd) => void): () => void {
    if (this.ended) {
      listener(this.ended)
      return () => undefined
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  end(reason: ReplayEnd): void {
    if (this.ended) return
    this.ended = reason
    for (const listener of [...this.listeners]) listener(reason)
  }
}

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }
const rom = new Uint8Array([9])
const start = vi.mocked(ReplayPlayer.start)
let players: FakePlayer[] = []
let missing = new Set<number>()

const emulator = { clip: vi.fn(async (from: number) => (missing.has(from) ? null : clip)) } as unknown as Emulator

const replay = (from: number): ReplayCall => ({
  kind: 'replay',
  key: `r:${from}`,
  subject: `r:${from}`,
  clip: { from, to: from + 50 },
  label: 'HIGHLIGHTS',
  colors: { primary: '#111', secondary: '#222' },
  payload: null,
})

const graphic: GraphicCall = { kind: 'graphic', key: 'g', subject: 'g', ms: 3000, payload: null }

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })

const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  players = []
  missing = new Set()
  start.mockReset()
  start.mockImplementation(async () => {
    const player = new FakePlayer()
    players.push(player)
    return player as unknown as ReplayPlayer
  })
  vi.mocked(emulator.clip).mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('the network timings are fixed', () => {
  expect(REPLAY_SPEED).toBe(0.75)
  expect(REPLAY_HOLD_MS).toBe(400)
  expect(LEAD_IN_MS).toBe(2000)
  expect(LEAD_OUT_MS).toBe(450)
})

test('a replay call clips its range, leads in, plays at replay speed and holds before it ends', async () => {
  const hook = renderHook(() => useClipRunner(emulator, rom))
  const then = vi.fn()
  act(() => hook.result.current.launch(replay(100), then))
  expect(emulator.clip).toHaveBeenCalledWith(100, 150)
  expect(hook.result.current.shown?.ready).toBe(false)
  await flush()
  expect(hook.result.current.shown?.leadIn).toBe(true)
  await wait(LEAD_IN_MS)
  await flush()
  expect(hook.result.current.shown?.leadIn).toBe(false)
  expect(start).toHaveBeenCalledWith(emulator, rom, clip, expect.any(HTMLCanvasElement), REPLAY_SPEED)
  act(() => players[0].end('done'))
  await wait(REPLAY_HOLD_MS - 1)
  expect(hook.result.current.shown).not.toBeNull()
  await wait(1)
  expect(hook.result.current.shown).toBeNull()
  expect(then).toHaveBeenCalledTimes(1)
})

test('a graphic call shows for its length with no lead-in and no clip', async () => {
  const hook = renderHook(() => useClipRunner(emulator, rom))
  const then = vi.fn()
  act(() => hook.result.current.launch(graphic, then))
  const view = hook.result.current.ready(hook.result.current.shown, () => undefined)
  expect(view?.call).toBe(graphic)
  expect(view?.leadIn).toBe(false)
  expect(view?.canvas).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()
  await wait(graphic.ms - 1)
  expect(hook.result.current.shown).not.toBeNull()
  await wait(1)
  expect(hook.result.current.shown).toBeNull()
  expect(then).toHaveBeenCalledTimes(1)
  expect(start).not.toHaveBeenCalled()
})

test('a reel plays its calls in order, skips a missing clip and is done after the last', async () => {
  missing = new Set([200])
  const calls = [replay(100), replay(200), replay(300)]
  const hook = renderHook((p: { active: boolean }) => useReel({ emulator, rom, calls, active: p.active }), { initialProps: { active: false } })
  expect(hook.result.current).toEqual({ view: null, at: null, total: 3, done: false })
  hook.rerender({ active: true })
  expect(hook.result.current.at).toBe(0)
  await flush()
  expect(hook.result.current.view?.call).toBe(calls[0])
  expect(hook.result.current.view?.leadIn).toBe(true)
  await wait(LEAD_IN_MS)
  await flush()
  act(() => players[0].end('done'))
  await wait(REPLAY_HOLD_MS)
  await flush()
  expect(hook.result.current.at).toBe(2)
  await wait(LEAD_IN_MS)
  await flush()
  act(() => players[1].end('done'))
  await wait(REPLAY_HOLD_MS)
  expect(hook.result.current.done).toBe(true)
  expect(hook.result.current.view).toBeNull()
  expect(vi.mocked(emulator.clip).mock.calls.map(([from]) => from)).toEqual([100, 200, 300])
})

test('a reel with no emulator is done at once', () => {
  const hook = renderHook(() => useReel({ emulator: null, rom, calls: [replay(100)], active: true }))
  expect(hook.result.current.done).toBe(true)
})
