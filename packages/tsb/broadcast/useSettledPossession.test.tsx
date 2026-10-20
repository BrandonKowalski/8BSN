import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../tools/replayFixture'
import { decodeGameState } from '../game/decode'
import { TSB2026_MAP } from '../game/maps/tsb2026'
import type { GameState } from '../game/types'
import { POSSESSION_SETTLE_MS, useSettledPossession } from './useSettledPossession'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const base = { playKind: 'scrimmage', ballInAir: null, possession: 0 } as const
const at = (patch: Partial<GameState>) => ({ ...base, ...patch }) as GameState

function mount(first: GameState) {
  return renderHook(({ state }: { state: GameState | null }) => useSettledPossession(state), { initialProps: { state: first as GameState | null } })
}

test('the settled possession starts at the decoded possession', () => {
  const { result } = mount(at({ possession: 1 }))
  expect(result.current).toBe(1)
})

test('the settled possession is null without a state', () => {
  const { result } = renderHook(() => useSettledPossession(null))
  expect(result.current).toBeNull()
})

test('a new possession shows only after it holds for the settle time', () => {
  const { result, rerender } = mount(at({ possession: 0 }))
  rerender({ state: at({ possession: 1 }) })
  act(() => vi.advanceTimersByTime(POSSESSION_SETTLE_MS - 1))
  expect(result.current).toBe(0)
  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe(1)
})

test('a short flip never shows', () => {
  const { result, rerender } = mount(at({ possession: 0 }))
  rerender({ state: at({ possession: 1 }) })
  act(() => vi.advanceTimersByTime(POSSESSION_SETTLE_MS / 2))
  rerender({ state: at({ possession: 0 }) })
  act(() => vi.advanceTimersByTime(POSSESSION_SETTLE_MS * 2))
  expect(result.current).toBe(0)
  rerender({ state: at({ possession: 1 }) })
  act(() => vi.advanceTimersByTime(POSSESSION_SETTLE_MS - 1))
  expect(result.current).toBe(0)
})

test('the possession does not change while a kickoff is in the air', () => {
  const { result, rerender } = mount(at({ possession: 1, playKind: 'kickoff' }))
  rerender({ state: at({ possession: 0, playKind: 'kickoff', ballInAir: { x: 2000, y: 100 } }) })
  act(() => vi.advanceTimersByTime(POSSESSION_SETTLE_MS * 2))
  expect(result.current).toBe(1)
  rerender({ state: at({ possession: 0, playKind: 'kickoff' }) })
  expect(result.current).toBe(0)
})

test('the possession football does not flicker on the kickoff after a score', () => {
  const fixture = loadReplayFixture('packages/tsb/fixtures/tsb2026/replay-game-a.json.gz')
  let hook: ReturnType<typeof mount> | null = null
  const shown: { frame: number; side: number | null }[] = []
  for (const snap of replaySnapshots(fixture, 'scoreKickoff')) {
    const state = decodeGameState(snap, TSB2026_MAP, [])
    if (!hook) hook = mount(state)
    else hook.rerender({ state })
    act(() => vi.advanceTimersByTime(1000 / 60))
    const side = hook.result.current
    if (shown.at(-1)?.side !== side) shown.push({ frame: snap.frame, side })
  }
  expect(shown.map((s) => s.side)).toEqual([1, 0])
  expect(shown[1].frame).toBeGreaterThanOrEqual(12963)
  expect(shown[1].frame).toBeLessThan(12963 + 120)
})
