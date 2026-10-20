import { act, cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../../tools/replayFixture'
import { decodeGameState } from '../../game/decode'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import { PlayTracker, type TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import Scorebug from './Scorebug'
import { teamColor } from './teamColors'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const css = readFileSync('src/views/broadcast/broadcast.css', 'utf8')
const rule = (selector: string) => [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('')

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
    down: 2,
    yardsToGo: 6,
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

const bug = (state: GameState, events: TrackerEvent[] = [], generation = 0) => <Scorebug state={state} helmets={new Map()} events={events} generation={generation} />

test('the scorebug lights the team with the ball and grays the other', () => {
  const { container, rerender } = render(bug(makeState({ possession: 0 })))
  const rows = () => container.querySelectorAll<HTMLElement>('.bug-team')
  expect(rows()[0]).toHaveStyle({ backgroundColor: teamColor('BUF').primary })
  expect(rows()[1]).toHaveStyle({ backgroundColor: '#2b2f36' })
  rerender(bug(makeState({ possession: 1 })))
  expect(rows()[0]).toHaveStyle({ backgroundColor: teamColor('BUF').primary })
  expect(rows()[0].querySelector('.bug-ball')).not.toBeNull()
})

test('used timeouts fade', () => {
  const state = makeState()
  state.teams[0].timeouts = 1
  const { container } = render(bug(state))
  const rows = container.querySelectorAll('.bug-team')
  expect(rows[0].querySelectorAll('.bug-timeout')).toHaveLength(3)
  expect(rows[0].querySelectorAll('.bug-timeout.used')).toHaveLength(2)
  expect(rows[1].querySelectorAll('.bug-timeout')).toHaveLength(3)
  expect(rows[1].querySelectorAll('.bug-timeout.used')).toHaveLength(0)
  expect(rule('.bug-timeout.used')).toMatch(/opacity: 0\.2;/)
})

test('the down box turns red inside the 20', () => {
  expect(rule('.bug-down')).toMatch(/background: #e8e8e8;/)
  expect(rule('.bug-down')).toMatch(/color: #000;/)
  expect(rule('.bug-down.bug-red-zone')).toMatch(/background: #c8102e;/)
  expect(rule('.bug-down.bug-red-zone')).toMatch(/color: #fff;/)
  const { container, rerender } = render(bug(makeState({ ballOn: { yard: 30, side: 1 } })))
  const down = () => container.querySelector('.bug-down')!
  expect(down()).not.toHaveClass('bug-red-zone')
  rerender(bug(makeState({ ballOn: { yard: 8, side: 1 }, down: 1, yardsToGo: 8 })))
  expect(down()).toHaveClass('bug-red-zone')
  expect(down()).toHaveTextContent('1ST & GOAL')
})

test('a score jump across a save load names no score in the down box', () => {
  const { container, rerender } = render(bug(makeState({ down: 2, yardsToGo: 7 })))
  const at = makeState({ down: 2, yardsToGo: 7 })
  rerender(bug({ ...at, teams: [{ ...at.teams[0], score: at.teams[0].score + 3 }, at.teams[1]] }, [], 1))
  expect(container.querySelector('.bug-down')).toHaveTextContent('2ND & 7')
  expect(container.querySelector<HTMLElement>('.bug-down')?.style.backgroundColor).toBe('')
})

test('no key-down chip shows above the scorebug', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(bug(makeState({ down: 3, yardsToGo: 9 })))
  rerender(bug(makeState({ down: 4, yardsToGo: 2, ballOn: { yard: 2, side: 1 }, quarter: 3, clock: { min: 1, sec: 0 } })))
  act(() => vi.advanceTimersByTime(100))
  expect(container.querySelector('.bug-chip, [data-testid="bug-chip"]')).toBeNull()
  expect(container.querySelector('.scorebug')?.firstElementChild).toHaveClass('bug-team')
  expect(css).not.toMatch(/bug-chip/)
})

test('the down box never shows a fresh down between a score and the try', () => {
  const fixture = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')
  const tracker = new PlayTracker({ recordRoutes: false })
  const events: TrackerEvent[] = []
  let view: ReturnType<typeof render> | null = null
  const shown: { text: string; background: string }[] = []
  const step = (snap: Parameters<typeof decodeGameState>[0]) => {
    const decoded = decodeGameState(snap, TSB2026_MAP, [])
    events.push(...tracker.push(decoded))
    const state = { ...decoded, teams: [{ ...decoded.teams[0], abbr: 'BUF' }, { ...decoded.teams[1], abbr: 'CLE' }] as GameState['teams'] }
    if (!view) view = render(bug(state, [...events]))
    else view.rerender(bug(state, [...events]))
    const down = view.container.querySelector<HTMLElement>('.bug-down')!
    const text = down.textContent ?? ''
    if (shown.at(-1)?.text !== text) shown.push({ text, background: down.style.backgroundColor })
  }
  for (const snap of replaySnapshots(fixture, 'touchdown')) {
    if (snap.frame >= 12700) break
    step(snap)
  }
  for (const snap of replaySnapshots(fixture, 'scoreKickoff')) step(snap)
  expect(shown.map((s) => s.text)).toEqual(['1ST & 10', 'TOUCHDOWN', 'TRY', '2PT TRY', 'KICKOFF', 'KICKOFF RETURN', '1ST & 10'])
  const scored = render(<div style={{ backgroundColor: teamColor('CLE').primary }} />).container.firstElementChild as HTMLElement
  expect(shown[1].background).toBe(scored.style.backgroundColor)
})

function downFrames(path: string, window: string) {
  const fixture = loadReplayFixture(path)
  const tracker = new PlayTracker({ recordRoutes: false })
  const events: TrackerEvent[] = []
  let view: ReturnType<typeof render> | null = null
  const shown: { frame: number; text: string; colored: boolean }[] = []
  for (const snap of replaySnapshots(fixture, window)) {
    const decoded = decodeGameState(snap, TSB2026_MAP, [])
    events.push(...tracker.push(decoded))
    const state = { ...decoded, teams: [{ ...decoded.teams[0], abbr: 'BUF' }, { ...decoded.teams[1], abbr: 'CLE' }] as GameState['teams'] }
    if (!view) view = render(bug(state, [...events]))
    else view.rerender(bug(state, [...events]))
    const down = view.container.querySelector<HTMLElement>('.bug-down')
    shown.push({ frame: snap.frame, text: down?.textContent ?? '', colored: !!down?.style.backgroundColor })
  }
  cleanup()
  return shown
}

const downTexts = (path: string, window: string) =>
  downFrames(path, window)
    .map((f) => f.text)
    .filter((text, i, all) => text !== all[i - 1])

test('a punt reads PUNT, then PUNT RETURN once it is fielded, never a down', () => {
  expect(downTexts('tests/fixtures/tsb2026/replay-punt-touchback.json.gz', 'puntTouchback')).toEqual(['PUNT', 'PUNT RETURN', '1ST & 10'])
  expect(downTexts('tests/fixtures/tsb2026/replay-game-a.json.gz', 'punt').slice(-3)).toEqual(['4TH & 16', 'PUNT', '1ST & GOAL'])
})

test('a kickoff reads KICKOFF, then KICKOFF RETURN once it is caught', () => {
  expect(downTexts('tests/fixtures/tsb2026/replay-kickoff-return.json.gz', 'kickoffReturn')).toEqual(['KICKOFF', 'KICKOFF RETURN', '1ST & 10'])
})

test('a field goal try reads FIELD GOAL and its down box is not a down', () => {
  const { container } = render(bug(makeState({ playKind: 'fieldGoal', down: 4, yardsToGo: 0, ballOn: { yard: 8, side: 1 } })))
  expect(container.querySelector('.bug-down')).toHaveTextContent('FIELD GOAL')
  expect(container.querySelector('.bug-down')).not.toHaveClass('bug-red-zone')
})

test('the down box keeps the kick word through the kick and names the score once the referee calls it good', () => {
  const fg = downFrames('tests/fixtures/tsb2026/replay-field-goal.json.gz', 'fieldGoal')
  expect(fg.every((f) => f.text === 'FIELD GOAL')).toBe(true)
  expect(fg.filter((f) => f.colored)[0]?.frame).toBe(7944)
  const xp = downTexts('tests/fixtures/tsb2026/replay-extra-point.json.gz', 'extraPoint')
  expect(xp).toEqual(['TRY', 'PAT', 'KICKOFF'])
})

test('a break names the quarter just played even though the quarter byte already holds the next one', () => {
  const { container, rerender } = render(bug(makeState({ quarter: 0, clock: { min: 0, sec: 0 } })))
  rerender(bug(makeState({ inGame: false, inBreak: true, quarter: 1, clock: { min: 0, sec: 0 } })))
  expect(container.querySelector('.bug-clock')).toHaveTextContent('1ST 0:00')
  expect(container.querySelector('.bug-down')).toHaveTextContent('END 1ST')
  cleanup()
  const fresh = render(bug(makeState({ inGame: false, inBreak: true, quarter: 2, clock: { min: 0, sec: 0 } })))
  expect(fresh.container.querySelector('.bug-clock')).toHaveTextContent('2ND 0:00')
  expect(fresh.container.querySelector('.bug-down')).toHaveTextContent('HALFTIME')
})
