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

import { breakView, useGame } from './useGame'

const team = (score = 0): TeamState => ({ id: 0, abbr: 'AAA', name: 'A', score, timeouts: 3, players: [] })

const state = (patch: Partial<GameState>, frame: number): GameState => ({
  inGame: true,
  inBreak: false,
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

  it('holds the last in-game numbers with fresh scores during a break', async () => {
    script.next = (frame) =>
      frame < 3
        ? state({ quarter: 1, clock: { min: 0, sec: 4 }, down: 3, teams: [team(2), team(6)] }, frame)
        : state({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 }, teams: [team(2), team(9)] }, frame)
    const emu = fakeEmu()
    const rom = new Uint8Array(4)
    const { result } = renderHook(() => useGame(emu, rom))
    for (let t = 0; t < 320; t += 16) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16)
      })
    }
    expect(result.current.state).toMatchObject({ inGame: false, inBreak: true, quarter: 1, clock: { min: 0, sec: 0 }, down: 3, live: false })
    expect(result.current.state?.teams.map((t) => t.score)).toEqual([2, 9])
  })

  it('returns null state without an emulator', () => {
    const { result } = renderHook(() => useGame(null, null))
    expect(result.current.state).toBeNull()
    expect(result.current.events).toEqual([])
  })
})

describe('breakView', () => {
  it('uses the last in-game quarter, a zero clock and the fresh teams', () => {
    const last = state({ quarter: 0, clock: { min: 0, sec: 2 }, down: 4, positions: [{ x: 1, y: 2 }] }, 10)
    const now = state({ inGame: false, inBreak: true, quarter: 1, clock: { min: 0, sec: 0 }, teams: [team(3), team(0)] }, 20)
    const view = breakView(last, now)
    expect(view).toMatchObject({ inGame: false, inBreak: true, live: false, playOver: false, quarter: 0, down: 4, frame: 20, positions: [] })
    expect(view.clock).toEqual({ min: 0, sec: 0 })
    expect(view.teams[0].score).toBe(3)
  })

  it('falls back to the quarter before the decoded one without an in-game state', () => {
    const now = state({ inGame: false, inBreak: true, quarter: 2 }, 20)
    expect(breakView(null, now).quarter).toBe(1)
    expect(breakView(null, { ...now, quarter: 0 }).quarter).toBe(0)
  })
})
