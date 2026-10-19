import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Emulator } from '../emu/Emulator'
import type { Snapshot } from '../emu/snapshot'
import { useScoringWipe } from '../views/broadcast/ScoringWipe'
import type { GameState, TeamState } from './types'

const script = vi.hoisted(() => ({ next: null as null | ((frame: number) => unknown) }))

vi.mock('./decode', () => ({
  decodeGameState: (snap: Snapshot) => script.next?.(snap.frame),
}))
vi.mock('./roster', async (importOriginal) => ({ ...(await importOriginal<typeof import('./roster')>()), parseRoster: () => [] }))

import { TSB2026 } from '../rom/profiles'
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
  thrown: false,
  call: null,
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
  playSelect: false,
  betweenPlays: false,
  carrier: null,
  carrierRoster: null,
  caught: false,
  touchback: false,
  outOfBounds: false,
  fumbled: false,
  ballInAir: null,
  deflected: false,
  deflector: null,
  passTarget: null,
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
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
    const rom = { bytes: new Uint8Array(4), profile: TSB2026 }
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
    const rom = { bytes: new Uint8Array(4), profile: TSB2026 }
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

  it('pushes no frames while a load is in flight and bumps the generation on restore', async () => {
    script.next = (frame) => state({ live: frame % 4 < 2, teams: [team(frame), team()] }, frame)
    const emu = fakeEmu()
    const rom = { bytes: new Uint8Array(4), profile: TSB2026 }
    const { result } = renderHook(() => useGame(emu, rom))
    const frames = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(16)
        })
      }
    }
    await frames(2)
    expect(result.current.generation).toBe(0)
    const push = vi.spyOn(result.current.tracker, 'push')
    act(() => result.current.suspend())
    const held = result.current.state
    await frames(12)
    expect(push).not.toHaveBeenCalled()
    expect(result.current.state).toBe(held)
    act(() => result.current.restore(null, 0))
    await frames(2)
    expect(push).toHaveBeenCalled()
    expect(result.current.generation).toBe(1)
    expect(result.current.state).not.toBe(held)
  })

  it('feeds no pre-load frame to the restored tracker and raises no score graphic after a load', async () => {
    const LOADED = 1200
    script.next = (frame) =>
      frame < LOADED ? state({ live: frame % 6 < 3, teams: [team(0), team(0)] }, frame) : state({ teams: [team(6), team(0)] }, frame)
    let shown = 100
    const emu = {
      readSnapshot: (into: Snapshot) => {
        into.frame = shown
        return true
      },
    } as unknown as Emulator
    const { result } = renderHook(() => {
      const game = useGame(emu, { bytes: new Uint8Array(4), profile: TSB2026 })
      return { game, wipe: useScoringWipe(game.state, true, game.generation) }
    })
    const graphics: unknown[] = []
    const frames = async (n: number, advance: boolean) => {
      for (let i = 0; i < n; i++) {
        if (advance) shown += 1
        await act(async () => {
          await vi.advanceTimersByTimeAsync(16)
        })
        if (result.current.wipe.wipe || result.current.wipe.held) graphics.push(result.current.wipe)
      }
    }
    await frames(10, true)
    act(() => result.current.game.suspend())
    await frames(3, true)
    shown += 1
    const push = vi.spyOn(result.current.game.tracker, 'push')
    act(() => result.current.game.restore(null, LOADED))
    await frames(3, false)
    shown = LOADED
    await frames(1, false)
    await frames(200, true)
    expect(push).toHaveBeenCalled()
    expect(push.mock.calls.map(([s]) => s.frame).filter((f) => f < LOADED)).toEqual([])
    expect(result.current.game.state?.teams[0].score).toBe(6)
    expect(result.current.game.tracker.plays()).toHaveLength(0)
    expect(graphics).toEqual([])
  })

  it('a resume after a failed load keeps the generation', async () => {
    script.next = (frame) => state({}, frame)
    const emu = fakeEmu()
    const { result } = renderHook(() => useGame(emu, { bytes: new Uint8Array(4), profile: TSB2026 }))
    act(() => result.current.suspend())
    act(() => result.current.resume())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32)
    })
    expect(result.current.generation).toBe(0)
    expect(result.current.state).not.toBeNull()
  })

  it('creates a fresh tracker for each emulator', () => {
    script.next = (frame) => state({}, frame)
    const rom = { bytes: new Uint8Array(4), profile: TSB2026 }
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
    const rom = { bytes: new Uint8Array(4), profile: TSB2026 }
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
