import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../../tools/replayFixture'
import { decodeGameState } from '../../game/decode'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import type { GameState } from '../../game/types'
import Scorebug from './Scorebug'
import ScoringWipe, { GLYPH_EM, useScoringWipe, WIPE_CAP_MS, WIPE_EXIT_MS, WIPE_MIN_MS, WORD_SPAN_CQH } from './ScoringWipe'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const state = (scores: [number, number], overrides: Partial<GameState> = {}) =>
  ({
    inGame: true,
    inBreak: false,
    live: false,
    playSelect: false,
    playKind: 'scrimmage',
    isTry: false,
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 1,
    yardsToGo: 10,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      { id: 0, abbr: 'BUF', name: 'BUF', score: scores[0], timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', score: scores[1], timeouts: 3, players: [] },
    ],
    ...overrides,
  }) as GameState

const helmets = new Map([[0, 'blob:bills']])

function Show({ state, allowed = true, generation = 0 }: { state: GameState; allowed?: boolean; generation?: number }) {
  const { wipe, held } = useScoringWipe(state, allowed, generation)
  return (
    <>
      <ScoringWipe wipe={wipe} state={state} helmets={helmets} />
      <Scorebug state={state} helmets={helmets} held={held} />
    </>
  )
}

const panelScores = () => ['left', 'right'].map((side) => screen.getByTestId(`wipe-score-${side}`).textContent)
const bugScore = () => Number(screen.getByTestId('bug-score-0').textContent)

function scored(first: GameState, then: GameState, allowed = true) {
  const view = render(<Show state={first} allowed={allowed} />)
  view.rerender(<Show state={then} allowed={allowed} />)
  return view
}

test('a score jump across a save load raises no panels', () => {
  const view = render(<Show state={state([14, 7])} />)
  view.rerender(<Show state={state([20, 7], { playOver: true })} generation={1} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(bugScore()).toBe(20)
  view.rerender(<Show state={state([26, 7], { playOver: true })} generation={1} />)
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
})

test('a touchdown wipe names the play and ticks the score', () => {
  scored(state([14, 7]), state([20, 7], { playOver: true }))
  for (const side of ['left', 'right']) {
    const panel = screen.getByTestId(`wipe-${side}`)
    expect(panel.querySelector('.wipe-word')).toHaveTextContent('TOUCHDOWN')
    expect(panel.querySelector('.wipe-helmet')).toHaveAttribute('src', 'blob:bills')
    expect(panel.querySelector('.wipe-bar')).toBe(screen.getByTestId(`wipe-score-${side}`))
  }
  expect(screen.getByTestId('wipe-left').querySelector('.wordmark')).toBeNull()
  expect(screen.getByTestId('wipe-right').querySelector('.wordmark-c3')).not.toBeNull()
  expect(panelScores()).toEqual(['BUF 14', 'BUF 14'])
  act(() => vi.advanceTimersByTime(900))
  const mid = Number(panelScores()[0]?.replace(/\D/g, ''))
  expect(mid).toBeGreaterThan(14)
  expect(mid).toBeLessThan(20)
  act(() => vi.advanceTimersByTime(WIPE_MIN_MS - 900))
  expect(panelScores()).toEqual(['BUF 20', 'BUF 20'])
})

test('the scorebug never shows the new score before the panels count to it', () => {
  const view = scored(state([14, 7]), state([20, 7], { playOver: true }))
  expect(bugScore()).toBe(14)
  for (let t = 0; t < 4000; t += 100) {
    expect(bugScore()).toBeLessThanOrEqual(Number(panelScores()[0]?.replace(/\D/g, '')))
    act(() => vi.advanceTimersByTime(100))
  }
  view.rerender(<Show state={state([20, 7], { betweenPlays: true })} allowed={false} />)
  expect(bugScore()).toBe(14)
  act(() => vi.advanceTimersByTime(WIPE_EXIT_MS))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(bugScore()).toBe(20)
  cleanup()
  const early = scored(state([14, 7]), state([20, 7]))
  expect(bugScore()).toBe(14)
  early.rerender(<Show state={state([20, 7], { playSelect: true })} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(bugScore()).toBe(20)
})

test('the score panels hold through the celebration and leave when the broadcast boxes', () => {
  const view = scored(state([14, 7]), state([20, 7], { playOver: true }))
  act(() => vi.advanceTimersByTime(8000))
  expect(screen.getByTestId('scoring-wipe')).not.toHaveClass('wipe-leaving')
  view.rerender(<Show state={state([20, 7], { betweenPlays: true })} allowed={false} />)
  expect(screen.getByTestId('scoring-wipe')).toHaveClass('wipe-leaving')
  act(() => vi.advanceTimersByTime(WIPE_EXIT_MS - 50))
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(50))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  const quick = scored(state([14, 7]), state([20, 7], { playOver: true }))
  act(() => vi.advanceTimersByTime(500))
  quick.rerender(<Show state={state([20, 7], { betweenPlays: true })} allowed={false} />)
  expect(screen.getByTestId('scoring-wipe')).not.toHaveClass('wipe-leaving')
  act(() => vi.advanceTimersByTime(WIPE_MIN_MS - 500))
  expect(screen.getByTestId('scoring-wipe')).toHaveClass('wipe-leaving')
  act(() => vi.advanceTimersByTime(WIPE_EXIT_MS))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  scored(state([14, 7]), state([20, 7], { playOver: true }))
  act(() => vi.advanceTimersByTime(WIPE_CAP_MS - 50))
  expect(screen.getByTestId('scoring-wipe')).not.toHaveClass('wipe-leaving')
  act(() => vi.advanceTimersByTime(50))
  expect(screen.getByTestId('scoring-wipe')).toHaveClass('wipe-leaving')
  act(() => vi.advanceTimersByTime(WIPE_EXIT_MS))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  expect(css).toMatch(/\.scoring-wipe\.wipe-leaving \{\s*animation: wipe-out 250ms ease-in both;/)
  expect(css).toMatch(/animation: wipe-rise 350ms /)
})

test('only touchdowns play the panels and other scores show at once without a celebration', () => {
  const play = (from: [number, number], to: [number, number], overrides: Partial<GameState> = {}) => {
    cleanup()
    let celebrating = false
    function Probe({ state }: { state: GameState }) {
      celebrating = useScoringWipe(state).celebrating
      return <Show state={state} />
    }
    const view = render(<Probe state={state(from, overrides)} />)
    view.rerender(<Probe state={state(to, overrides)} />)
    return { panels: screen.queryByTestId('scoring-wipe') !== null, celebrating, bug: bugScore() }
  }
  expect(play([14, 7], [20, 7])).toMatchObject({ panels: true, bug: 14 })
  expect(play([14, 7], [17, 7])).toEqual({ panels: false, celebrating: false, bug: 17 })
  expect(play([14, 7], [14, 9])).toEqual({ panels: false, celebrating: false, bug: 14 })
  expect(play([20, 7], [21, 7], { isTry: true })).toEqual({ panels: false, celebrating: false, bug: 21 })
  expect(play([0, 0], [14, 7])).toMatchObject({ panels: false, celebrating: false })
})

test('a score that rises while the view is boxed waits for the margins and drops at play select or the snap', () => {
  const boxed = scored(state([14, 7]), state([20, 7], { betweenPlays: true }), false)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(bugScore()).toBe(14)
  boxed.rerender(<Show state={state([20, 7])} allowed={true} />)
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  cleanup()
  const select = scored(state([14, 7]), state([20, 7]), false)
  select.rerender(<Show state={state([20, 7], { playSelect: true })} allowed={false} />)
  select.rerender(<Show state={state([20, 7])} allowed={true} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(bugScore()).toBe(20)
  cleanup()
  const snap = scored(state([14, 7]), state([20, 7]), false)
  snap.rerender(<Show state={state([20, 7], { live: true })} allowed={false} />)
  snap.rerender(<Show state={state([20, 7])} allowed={true} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
})

test('the wipe closes when play select opens', () => {
  const view = scored(state([14, 7]), state([20, 7]))
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(300))
  view.rerender(<Show state={state([20, 7], { playSelect: true })} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  view.rerender(<Show state={state([20, 7])} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  const live = scored(state([14, 7]), state([20, 7]))
  live.rerender(<Show state={state([20, 7], { live: true })} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  const boxed = scored(state([14, 7]), state([20, 7]))
  act(() => vi.advanceTimersByTime(WIPE_MIN_MS))
  boxed.rerender(<Show state={state([20, 7])} allowed={false} />)
  act(() => vi.advanceTimersByTime(WIPE_EXIT_MS))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
})

test('the word fills the space under the bar and every word fits it', () => {
  const size = (from: [number, number], to: [number, number], overrides: Partial<GameState> = {}) => {
    cleanup()
    scored(state(from, overrides), state(to, overrides))
    const word = screen.getByTestId('wipe-left').querySelector<HTMLElement>('.wipe-word')!
    return { size: parseFloat(word.style.fontSize), length: word.textContent!.length }
  }
  const touchdown = size([14, 7], [20, 7])
  expect(touchdown.size).toBeGreaterThanOrEqual(8)
  for (const word of [touchdown]) {
    expect(word.size * word.length * GLYPH_EM).toBeLessThanOrEqual(WORD_SPAN_CQH + 0.05)
  }
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  expect(css).toMatch(/\.wipe-panel \{[^}]*justify-content: space-evenly;/)
  expect(css).toMatch(/\.wipe-bottom \{[^}]*height: 50cqh;/)
})

test('the wipe panels fill both margins beside the game, over the scorebug, and fade when motion is reduced', () => {
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''
  expect(rule('.wipe-left')).toMatch(/left: 0;/)
  expect(rule('.wipe-left')).toMatch(/width: var\(--full-left\);/)
  expect(rule('.wipe-right')).toMatch(/left: calc\(var\(--full-left\) \+ var\(--full-w\)\);/)
  expect(rule('.wipe-right')).toMatch(/right: 0;/)
  expect(rule('.wipe-panel')).toMatch(/top: 0;/)
  expect(rule('.wipe-panel')).toMatch(/bottom: 0;/)
  expect(rule('.wipe-bar')).toMatch(/background: var\(--wipe-secondary\);/)
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.wipe-panel[^@]*animation: wipe-fade/)
  expect(rule('.scorebug')).not.toMatch(/z-index/)
  expect(rule('.scoring-wipe')).toMatch(/z-index: \d+;/)
})

function kickWipe(path: string, window: string) {
  let view: ReturnType<typeof render> | null = null
  const frames: { frame: number; word: string | null; bug: number; score: number }[] = []
  for (const snap of replaySnapshots(loadReplayFixture(path), window)) {
    const decoded = decodeGameState(snap, TSB2026_MAP, [])
    const now = { ...decoded, teams: [{ ...decoded.teams[0], abbr: 'BUF' }, { ...decoded.teams[1], abbr: 'CLE' }] as GameState['teams'] }
    if (!view) view = render(<Show state={now} />)
    else view.rerender(<Show state={now} />)
    const word = screen.queryByTestId('wipe-right')?.querySelector('.wipe-word')?.textContent ?? null
    frames.push({ frame: snap.frame, word, bug: Number(screen.getByTestId('bug-score-1').textContent), score: now.teams[1].score })
  }
  return frames
}

test('a field goal holds the old score until the kick play is over, then shows the new score with no panels', () => {
  const frames = kickWipe('tests/fixtures/tsb2026/replay-field-goal.json.gz', 'fieldGoal')
  const rose = frames.find((f) => f.score === 3)!.frame
  const over = 8175
  expect(rose).toBe(7674)
  for (const f of frames.filter((f) => f.frame < over)) expect(f.bug).toBe(0)
  expect(frames.find((f) => f.frame === over)?.bug).toBe(3)
  expect(frames.every((f) => f.word === null)).toBe(true)
})

test('an extra point holds the old score until the kick play is over, then shows the new score with no panels', () => {
  const frames = kickWipe('tests/fixtures/tsb2026/replay-extra-point.json.gz', 'extraPoint')
  expect(frames.find((f) => f.score === 7)!.frame).toBe(12489)
  for (const f of frames.filter((f) => f.frame < 12786)) expect(f.bug).toBe(6)
  expect(frames.find((f) => f.frame === 12786)?.bug).toBe(7)
  expect(frames.every((f) => f.word === null)).toBe(true)
})
