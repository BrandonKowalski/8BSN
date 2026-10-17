import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { PlayTracker } from '../../game/playTracker'
import type { GameState, PlayerStats, TeamState } from '../../game/types'
import Ticker, { fixedSegment, tickerItems } from './Ticker'

afterEach(cleanup)

const NAMES = ['ALLEN', 'COOK', 'KINCAID', 'OLIVER', 'IDLE']
const names = (_team: 0 | 1, index: number) => NAMES[index] ?? ''

function team(abbr: string, score: number, players: PlayerStats[]): TeamState {
  return { id: 0, abbr, name: abbr, score, timeouts: 3, players }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    inGame: true,
    live: true,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 3,
    yardsToGo: 4,
    ballOn: { yard: 30, side: 0 },
    offense: 0,
    teams: [
      team('BUF', 14, [
        { rosterIndex: 0, pass: { att: 17, comp: 11, yds: 142, td: 0, int: 1 } },
        { rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } },
        { rosterIndex: 2, rec: { rec: 4, yds: 51, td: 0 } },
        { rosterIndex: 4, rush: { att: 0, yds: 0, td: 0 } },
      ]),
      team('MIA', 7, [{ rosterIndex: 3, def: { sacks: 1, int: 0 } }]),
    ],
    positions: [],
    frame: 1,
    ...overrides,
  }
}

const tracker = () => new PlayTracker({ recordRoutes: false })

test('tickerItems lists nonzero player lines', () => {
  const items = tickerItems(makeState(), tracker(), names)
  expect(items).toContain('COOK 11-74 1 TD')
  expect(items).toContain('ALLEN 11/17 142 YDS 0 TD 1 INT')
  expect(items).toContain('KINCAID 4-51')
  expect(items).toContain('OLIVER 1 SACK')
})

test('tickerItems omits zero-stat players', () => {
  const items = tickerItems(makeState(), tracker(), names)
  expect(items.some((item) => item.includes('IDLE'))).toBe(false)
})

test('fixedSegment shows scores, quarter, clock, and down', () => {
  expect(fixedSegment(makeState())).toBe('BUF 14  MIA 7  2ND 3:12  3RD & 4')
})

test('Ticker off the field shows the title and no numbers', () => {
  const { container } = render(<Ticker state={makeState({ inGame: false })} tracker={tracker()} names={names} />)
  expect(container.textContent).toContain('TECMO BROADCAST')
  expect(container.textContent).not.toMatch(/\d/)
})

test('Ticker renders the fixed segment and a duplicated strip', () => {
  const { container } = render(<Ticker state={makeState()} tracker={tracker()} names={names} />)
  expect(container.textContent).toContain('BUF 14  MIA 7  2ND 3:12  3RD & 4')
  expect(container.querySelectorAll('.ticker-strip')).toHaveLength(2)
})
