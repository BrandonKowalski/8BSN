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
  quarter: 0,
  clock: { min: 5, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 20, side: 0 },
  offense: 0,
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

  it('commits immediately when a playEnd event fires', async () => {
    script.next = (frame) => {
      if (frame < 20) return state({}, frame)
      if (frame < 24) return state({ live: true }, frame)
      return state({ playOver: true }, frame)
    }
    const emu = fakeEmu()
    const rom = new Uint8Array(4)
    const { result } = renderHook(() => useGame(emu, rom))
    let sawPlayEnd = false
    for (let i = 0; i < 60 && !sawPlayEnd; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16)
      })
      sawPlayEnd = result.current.events.some((e) => e.type === 'playEnd')
      if (sawPlayEnd) expect(result.current.tracker.plays()).toHaveLength(1)
    }
    expect(sawPlayEnd).toBe(true)
  })

  it('returns null state without an emulator', () => {
    const { result } = renderHook(() => useGame(null, null))
    expect(result.current.state).toBeNull()
    expect(result.current.events).toEqual([])
  })
})
