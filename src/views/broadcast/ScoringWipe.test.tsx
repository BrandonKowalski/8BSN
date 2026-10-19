import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { PlayResult, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import { SCORING_WIPE_MS } from './replay/useReplay'
import Scorebug from './Scorebug'
import ScoringWipe, { useScoringWipe } from './ScoringWipe'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const state = (overrides: Partial<GameState> = {}) =>
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
      { id: 0, abbr: 'BUF', name: 'BUF', score: 20, timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', score: 7, timeouts: 3, players: [] },
    ],
    ...overrides,
  }) as GameState

const touchdown: PlayResult = {
  index: 4,
  offense: 0,
  quarter: 1,
  yards: 45,
  touchdown: true,
  sack: false,
  interception: false,
  kicked: false,
  thrown: false,
  call: 'run',
  scramble: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary: 'COOK RUSH, 45 YDS, TOUCHDOWN',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 45, side: 1 },
  scoreBefore: [14, 7],
  scoreAfter: [20, 7],
  tracks: { frames: [], players: [] },
  people: { rusher: 3 },
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
}

const helmets = new Map([[0, 'blob:bills']])
const ended: TrackerEvent[] = [{ type: 'snap' }, { type: 'playEnd', play: touchdown }]

function Show({ events, state, allowed = true }: { events: TrackerEvent[]; state: GameState; allowed?: boolean }) {
  const wipe = useScoringWipe(events, state, allowed)
  return (
    <>
      <ScoringWipe wipe={wipe} state={state} helmets={helmets} />
      <Scorebug state={state} helmets={helmets} />
    </>
  )
}

test('a touchdown wipe names the play and ticks the score', () => {
  const { rerender } = render(<Show events={[{ type: 'snap' }]} state={state()} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('20')
  rerender(<Show events={ended} state={state()} />)
  for (const side of ['left', 'right']) {
    const panel = screen.getByTestId(`wipe-${side}`)
    expect(panel.querySelector('.wipe-word')).toHaveTextContent('TOUCHDOWN')
    expect(panel.querySelector('.wipe-helmet')).toHaveAttribute('src', 'blob:bills')
  }
  expect(screen.getByTestId('wipe-left').querySelector('.wordmark')).toBeNull()
  expect(screen.getByTestId('wipe-right').querySelector('.wordmark-c3')).not.toBeNull()
  const panelScores = () => ['left', 'right'].map((side) => screen.getByTestId(`wipe-score-${side}`).textContent)
  expect(panelScores()).toEqual(['BUF 14', 'BUF 14'])
  act(() => vi.advanceTimersByTime(900))
  const mid = Number(panelScores()[0]?.replace(/\D/g, ''))
  expect(mid).toBeGreaterThan(14)
  expect(mid).toBeLessThan(20)
  act(() => vi.advanceTimersByTime(SCORING_WIPE_MS - 901))
  expect(panelScores()).toEqual(['BUF 20', 'BUF 20'])
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  expect(screen.getByTestId('bug-score-0')).toHaveTextContent('20')
  rerender(<Show events={[...ended]} state={state()} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
})

test('the wipe names field goals, safeties and tries and skips plays that do not score', () => {
  const show = (play: PlayResult) => {
    cleanup()
    render(<Show events={[{ type: 'playEnd', play }]} state={state()} />)
    return screen.queryByTestId('wipe-right')?.querySelector('.wipe-word') ?? null
  }
  expect(show({ ...touchdown, touchdown: false, kind: 'fieldGoal', summary: 'FIELD GOAL GOOD', scoreAfter: [17, 7] })).toHaveTextContent('FIELD GOAL')
  expect(show({ ...touchdown, touchdown: false, scoreAfter: [14, 9] })).toHaveTextContent('SAFETY')
  expect(show({ ...touchdown, touchdown: false, isTry: true, summary: 'PAT GOOD', scoreBefore: [20, 7], scoreAfter: [21, 7] })).toHaveTextContent('PAT')
  expect(show({ ...touchdown, touchdown: false, scoreAfter: [14, 7] })).toBeNull()
})

test('the score panels hold for 3.2 seconds with the same entry and exit', () => {
  expect(SCORING_WIPE_MS).toBe(3200)
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  expect(css).toMatch(/animation: wipe-out 250ms ease-in calc\(var\(--wipe-ms\) - 250ms\) both;/)
  expect(css).toMatch(/animation: wipe-rise 350ms /)
  render(<Show events={ended} state={state()} />)
  expect(screen.getByTestId('scoring-wipe').style.getPropertyValue('--wipe-ms')).toBe('3200ms')
})

test('the wipe closes when play select opens', () => {
  const { rerender } = render(<Show events={ended} state={state()} />)
  expect(screen.getByTestId('scoring-wipe')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(300))
  rerender(<Show events={ended} state={state({ playSelect: true })} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  rerender(<Show events={ended} state={state()} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  const second = render(<Show events={ended} state={state()} />)
  second.rerender(<Show events={ended} state={state({ live: true })} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
  cleanup()
  const boxed = render(<Show events={ended} state={state()} />)
  boxed.rerender(<Show events={ended} state={state()} allowed={false} />)
  expect(screen.queryByTestId('scoring-wipe')).toBeNull()
})

test('the wipe panels fill both margins beside the game, over the scorebug, and fade when motion is reduced', () => {
  const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''
  expect(rule('.wipe-left')).toMatch(/left: 0;/)
  expect(rule(".wipe-left")).toMatch(/width: var\(--full-left\);/)
  expect(rule('.wipe-right')).toMatch(/left: calc\(var\(--full-left\) \+ var\(--full-w\)\);/)
  expect(rule('.wipe-right')).toMatch(/right: 0;/)
  expect(rule('.wipe-left')).toMatch(/bottom: 0;/)
  expect(rule('.wipe-right')).toMatch(/bottom: 0;/)
  expect(rule('.wipe-panel')).toMatch(/top: 0;/)
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.wipe-panel[^@]*animation: wipe-fade/)
  expect(rule('.scorebug')).not.toMatch(/z-index/)
  expect(rule('.scoring-wipe')).toMatch(/z-index: \d+;/)
})
