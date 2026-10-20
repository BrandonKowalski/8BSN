import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Emulator } from '@8bsn/sdk'
import { renderStation } from '@8bsn/sdk/testing'
import tsb from '..'
import { teamColor, teamColors, TSB1991_COLORS } from '../broadcast/teamColors'
import { useHelmets } from '../helmets/useHelmets'
import { PlayTracker, type TrackerEvent } from './playTracker'
import { TSB1991, TSB2026 } from './roms'
import { packageVisible } from './session'
import type { GameState } from './types'
import { useGame, type Game } from './useGame'

const fed = vi.hoisted(() => ({ game: null as unknown, helmets: new Map() }))

vi.mock('./useGame', async (importOriginal) => ({ ...(await importOriginal<typeof import('./useGame')>()), useGame: vi.fn(() => fed.game) }))
vi.mock('../helmets/useHelmets', () => ({ useHelmets: vi.fn(() => fed.helmets) }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const player = () => ({ first: 'James', last: 'Cook', number: 28, position: 'RB' as const })
const NO_EVENTS: TrackerEvent[] = []

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
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
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 3,
    yardsToGo: 4,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      { id: 0, abbr: 'BUF', name: 'BUF', city: '', score: 14, timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', city: '', score: 7, timeouts: 3, players: [] },
    ],
    playSelect: false,
    betweenPlays: false,
    carrier: null,
    carrierRoster: null,
    caught: false,
    touchback: false,
    outOfBounds: false,
    fumbled: false,
    kickCalled: false,
    intro: null,
    ballInAir: null,
    deflected: false,
    deflector: null,
    passTarget: null,
    field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
    positions: [],
    frame: 1,
    ...overrides,
  }
}

type Feed = { state: GameState | null; tracker: PlayTracker; events?: TrackerEvent[]; generation?: number; final?: GameState | null }

function feed({ state, tracker, events = NO_EVENTS, generation = 0, final = null }: Feed): Game {
  const game: Game = { state, final, tracker, events, generation, names: () => '', player, sidecar: vi.fn(() => ({ tracker: tracker.sidecar(), lastInGame: null })), restore: vi.fn(), suspend: vi.fn(), resume: vi.fn() }
  fed.game = game
  return game
}

test('packageVisible is false off the field regardless of live or force', () => {
  expect(packageVisible(null, true, true)).toBe(false)
  expect(packageVisible(null, true, false)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, true)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, false)).toBe(false)
})

test('packageVisible with live detection follows the play select screen and ignores force', () => {
  expect(packageVisible(makeState({ playSelect: true }), false, true)).toBe(true)
  expect(packageVisible(makeState({ playSelect: false }), false, true)).toBe(false)
  expect(packageVisible(makeState({ playSelect: true }), true, true)).toBe(true)
  expect(packageVisible(makeState({ playSelect: false }), true, true)).toBe(false)
})

test('the game stays full size after a play, at kickoff and before the snap until play select shows', () => {
  expect(packageVisible(makeState({ playOver: true }), false, true)).toBe(false)
  expect(packageVisible(makeState({ playKind: 'kickoff' }), false, true)).toBe(false)
  expect(packageVisible(makeState({ live: false, playSelect: false }), false, true)).toBe(false)
})

test('packageVisible without live detection equals forcePackage', () => {
  expect(packageVisible(makeState({ live: false }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: true }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: false }), true, false)).toBe(true)
  expect(packageVisible(makeState({ live: true }), true, false)).toBe(true)
})

test('packageVisible boxes the lead-in only before play select has shown', () => {
  expect(packageVisible(makeState({ betweenPlays: true }), false, true, false)).toBe(true)
  expect(packageVisible(makeState({ betweenPlays: true }), false, true, true)).toBe(false)
  expect(packageVisible(makeState({ betweenPlays: true, playSelect: true }), false, true, true)).toBe(true)
})

test('the view is boxed on the play select screen and unboxed the instant it closes', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  feed({ state: makeState({ playSelect: true }), tracker })
  const { rerender } = renderStation(tsb, { canvasSlot: vi.fn() })
  const view = screen.getByTestId('bc-stage')
  expect(view).toHaveAttribute('data-phase', 'window')
  expect(screen.getByTestId('region-stats')).toBeVisible()
  feed({ state: makeState({ playSelect: false }), tracker })
  rerender()
  expect(view).not.toHaveAttribute('data-phase', 'window')
  expect(screen.getByTestId('region-stats')).not.toBeVisible()
})

test('the box comes in on the black lead-in, holds through play select and leaves when select closes even if the punt formation keeps the status clear', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const show = (state: GameState) => {
    feed({ state, tracker })
    rerender()
  }
  feed({ state: makeState({ playOver: true }), tracker })
  const { rerender } = renderStation(tsb)
  const el = screen.getByTestId('bc-stage')
  expect(el).not.toHaveAttribute('data-phase', 'window')
  show(makeState({ betweenPlays: true }))
  expect(el).toHaveAttribute('data-phase', 'window')
  show(makeState({ betweenPlays: true, playSelect: true }))
  expect(el).toHaveAttribute('data-phase', 'window')
  show(makeState({ betweenPlays: true }))
  expect(el).not.toHaveAttribute('data-phase', 'window')
  show(makeState({ live: true }))
  expect(el).not.toHaveAttribute('data-phase', 'window')
  show(makeState({ betweenPlays: true }))
  expect(el).toHaveAttribute('data-phase', 'window')
})

test('from the PRESEASON card until kickoff the game is full size with no ticker', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const show = (state: GameState) => {
    feed({ state, tracker })
    rerender()
  }
  feed({ state: makeState({ inGame: false }), tracker })
  const { rerender } = renderStation(tsb)
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'menus')
  show(makeState({ inGame: false, intro: 'card' }))
  expect(screen.getByTestId('bc-stage')).not.toHaveAttribute('data-phase', 'menus')
  expect(screen.getByTestId('region-ticker')).not.toBeVisible()
  show(makeState({ inGame: false, intro: null }))
  show(makeState({ inGame: false, intro: 'coinToss' }))
  expect(screen.getByTestId('bc-stage')).not.toHaveAttribute('data-phase', 'menus')
  show(makeState({ live: true }))
  show(makeState({ inGame: false }))
  expect(screen.getByTestId('bc-stage')).toHaveAttribute('data-phase', 'menus')
})

test('a tailgate game ends once it has started and left the air, and a new emulator starts the count again', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  const tracker = new PlayTracker({ recordRoutes: false })
  const fake = () => ({ pause: vi.fn(), resume: vi.fn(), autoplay: vi.fn(), setHumanInput: vi.fn(), setAutoInput: vi.fn(), readSnapshot: () => true }) as unknown as Emulator
  const onTailgateFinal = vi.fn()
  const first = fake()
  feed({ state: makeState({ inGame: false }), tracker })
  const { rerender } = renderStation(tsb, { emulator: first, rom: new Uint8Array([1]), tailgate: true, onTailgateFinal })
  act(() => vi.advanceTimersToNextFrame())
  expect(first.autoplay).toHaveBeenLastCalledWith(expect.any(Array))
  expect(onTailgateFinal).not.toHaveBeenCalled()
  feed({ state: makeState(), tracker })
  rerender()
  act(() => vi.advanceTimersToNextFrame())
  expect(onTailgateFinal).not.toHaveBeenCalled()
  feed({ state: null, tracker })
  rerender()
  act(() => vi.advanceTimersToNextFrame())
  act(() => vi.advanceTimersToNextFrame())
  expect(onTailgateFinal).toHaveBeenCalledTimes(1)
  const second = fake()
  rerender({ emulator: second })
  act(() => vi.advanceTimersToNextFrame())
  expect(onTailgateFinal).toHaveBeenCalledTimes(1)
})

test('switching between the two ROMs moves team colors, roster and helmets with it', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const old = new Uint8Array([1])
  const fresh = new Uint8Array([2])
  feed({ state: makeState(), tracker })
  const { rerender } = renderStation(tsb, { rom: old, sha1: TSB1991.sha1 })
  expect(teamColor('NE')).toEqual(TSB1991_COLORS.NE)
  expect(vi.mocked(useGame).mock.lastCall?.[1]).toMatchObject({ bytes: old, rom: { sha1: TSB1991.sha1 } })
  expect(vi.mocked(useHelmets).mock.lastCall?.[0]).toMatchObject({ bytes: old, rom: { sha1: TSB1991.sha1 } })
  rerender({ rom: fresh, sha1: TSB2026.sha1 })
  expect(teamColor('NE')).toEqual(teamColors.NE)
  expect(teamColors.NE).not.toEqual(TSB1991_COLORS.NE)
  expect(vi.mocked(useGame).mock.lastCall?.[1]).toMatchObject({ bytes: fresh, rom: { sha1: TSB2026.sha1 } })
  expect(vi.mocked(useHelmets).mock.lastCall?.[0]).toMatchObject({ bytes: fresh, rom: { sha1: TSB2026.sha1 } })
})

test('the session saves and restores through the game sidecar', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const game = feed({ state: makeState(), tracker })
  const pkg = { ...tsb, useSession: (ctx: Parameters<typeof tsb.useSession>[0]) => (seen = tsb.useSession(ctx)) }
  let seen: ReturnType<typeof tsb.useSession> | null = null
  renderStation(pkg, { rom: new Uint8Array([1]) })
  expect(seen!.save).toBe(game.sidecar)
  expect(seen!.restore).toBe(game.restore)
  expect(seen!.suspend).toBe(game.suspend)
  expect(seen!.resume).toBe(game.resume)
  expect(seen!.generation).toBe(0)
  expect(seen!.data.romSha1).toBe(TSB2026.sha1)
})

test('the session data keeps its identity across a re-render with unchanged inputs', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  feed({ state: makeState(), tracker })
  const seen: ReturnType<typeof tsb.useSession>['data'][] = []
  const useSession = (ctx: Parameters<typeof tsb.useSession>[0]) => {
    const session = tsb.useSession(ctx)
    seen.push(session.data)
    return session
  }
  const pkg = { ...tsb, useSession }
  const { rerender } = renderStation(pkg, { rom: new Uint8Array([1]) })
  rerender()
  rerender()
  expect(seen.length).toBeGreaterThanOrEqual(3)
  expect(new Set(seen.slice(-3)).size).toBe(1)
})
