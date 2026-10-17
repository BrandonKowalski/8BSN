import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Emulator } from '../emu/Emulator'
import type { Snapshot } from '../emu/snapshot'
import type { GameState, TeamState } from './types'

const script = vi.hoisted(() => ({ next: null as null | ((frame: number) => unknown) }))

vi.mock('./decode', () => ({
  decodeGameState: (snap: Snapshot) => script.next?.(snap.frame),
}))
vi.mock('./roster', () => ({ parseRoster: () => [] }))

import { useGame } from './useGame'

const team = (): TeamState => ({ id: 0, abbr: 'AAA', name: 'A', score: 0, timeouts: 3, players: [] })

const state = (patch: Partial<GameState>, frame: number): GameState => ({
  inGame: true,
  live: false,
  playOver: false,
  touchdown: false,
  sack: false,
  kicked: false,
  playKind: 'scrimmage',
  isTry: false,
  quarter: 0,
  clock: { min: 5, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 20, side: 0 },
  offense: 0,
  possession: 0,
  teams: [team(), team()],
  positions: [],
  frame,
  ...patch,
})

const fakeEmu = () => {
  let frame = 0
  return {
    readSnapshot: (into: Snapshot) => {
      frame += 1
      into.frame = frame
      return true
    },
  } as unknown as Emulator
}

describe('useGame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('commits at most 7 renders in 600 ms while the snapshot changes every frame', async () => {
    script.next = (frame) => state({}, frame)
    let renders = 0
    const emu = fakeEmu()
    const rom = new Uint8Array(4)
    renderHook(() => {
      renders += 1
      return useGame(emu, rom)
    })
    const before = renders
    for (let t = 0; t < 600; t += 16) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16)
      })
    }
    expect(renders - before).toBeLessThanOrEqual(7)
    expect(renders - before).toBeGreaterThan(1)
  })

  it('commits a playEnd on the same frame even inside the throttle window', async () => {
    script.next = (frame) => (frame < 3 ? state({ live: true }, frame) : state({}, frame))
    const emu = fakeEmu()
    const rom = new Uint8Array(4)
    const seen: { renders: number; ends: number }[] = []
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useGame(emu, rom)
    })
    for (let t = 0; t < 64; t += 16) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16)
      })
      seen.push({ renders, ends: result.current.events.filter((e) => e.type === 'playEnd').length })
    }
    expect(seen[0].ends).toBe(0)
    expect(seen[1].renders).toBe(seen[0].renders)
    expect(seen[2].ends).toBe(1)
    expect(seen[2].renders).toBe(seen[1].renders + 1)
    expect(result.current.tracker.plays()).toHaveLength(1)
  })

  it('creates a fresh tracker for each emulator', () => {
    script.next = (frame) => state({}, frame)
    const rom = new Uint8Array(4)
    const first = fakeEmu()
    const { result, rerender } = renderHook(({ emu }) => useGame(emu, rom), { initialProps: { emu: first } })
    const before = result.current.tracker
    rerender({ emu: fakeEmu() })
    expect(result.current.tracker).not.toBe(before)
  })

  it('returns null state without an emulator', () => {
    const { result } = renderHook(() => useGame(null, null))
    expect(result.current.state).toBeNull()
    expect(result.current.events).toEqual([])
  })
})
