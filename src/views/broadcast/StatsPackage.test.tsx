import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker, type BigMoment, type Drive, type PlayResult } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import StatsPackage from './StatsPackage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NAMES = ['ALLEN', 'COOK', 'KINCAID', 'OLIVER', 'ACHANE']
const names = (_team: 0 | 1, index: number) => NAMES[index] ?? ''

function makeState(): GameState {
  return {
    inGame: true,
    live: false,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
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
      {
        id: 0,
        abbr: 'BUF',
        name: 'BUF',
        score: 14,
        timeouts: 3,
        players: [
          { rosterIndex: 0, pass: { att: 17, comp: 11, yds: 142, td: 0, int: 1 } },
          { rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } },
          { rosterIndex: 2, rec: { rec: 4, yds: 51, td: 0 } },
        ],
      },
      {
        id: 1,
        abbr: 'MIA',
        name: 'MIA',
        score: 7,
        timeouts: 3,
        players: [
          { rosterIndex: 3, def: { sacks: 2, int: 0 } },
          { rosterIndex: 4, rush: { att: 8, yds: 41, td: 0 } },
        ],
      },
    ],
    positions: [],
    frame: 1,
  }
}

const play = (index: number, summary: string, overrides: Partial<PlayResult> = {}): PlayResult => ({
  index,
  offense: 0,
  quarter: 1,
  yards: 5,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  summary,
  ...overrides,
})

function trackerWith(plays: PlayResult[], moments: BigMoment[] = [], drives: Drive[] = []): PlayTracker {
  const tracker = new PlayTracker({ recordRoutes: false })
  vi.spyOn(tracker, 'plays').mockReturnValue(plays)
  vi.spyOn(tracker, 'latestPlay').mockReturnValue(plays[plays.length - 1] ?? null)
  vi.spyOn(tracker, 'moments').mockReturnValue(moments)
  vi.spyOn(tracker, 'drives').mockReturnValue(drives)
  return tracker
}

test('stats list rushing before passing, receiving and defense', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} />)
  const titles = screen.getAllByTestId('stat-title').map((el) => el.textContent ?? '')
  expect(titles.map((t) => t.split(' ')[0])).toEqual(['RUSHING', 'PASSING', 'RECEIVING', 'DEFENSE'])
})

test('rushing lines are sorted by yards and carry team totals', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} />)
  const section = screen.getByTestId('stats-rushing')
  const lines = within(section).getAllByTestId('stat-line').map((el) => el.textContent)
  expect(lines[0]).toContain('COOK 11-74 1 TD')
  expect(lines[1]).toContain('ACHANE 8-41')
  expect(section).toHaveTextContent('BUF 74')
  expect(section).toHaveTextContent('MIA 41')
})

test('the last play panel has the route replay slot and the latest summary', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), play(1, 'ALLEN PASS TO KINCAID, 22 YDS')])} names={names} />)
  expect(screen.getByTestId('route-replay-slot')).toBeEmptyDOMElement()
  expect(screen.getByTestId('last-play')).toHaveTextContent('ALLEN PASS TO KINCAID, 22 YDS')
})

test('the current drive shows plays, yards and the spot', () => {
  const drives: Drive[] = [{ offense: 0, plays: 6, yards: 48, startClock: '7:02', result: 'IN_PROGRESS' }]
  render(<StatsPackage state={makeState()} tracker={trackerWith([], [], drives)} names={names} />)
  const panel = screen.getByTestId('current-drive')
  expect(panel).toHaveTextContent('BUF DRIVE')
  expect(panel).toHaveTextContent('6 PLAYS')
  expect(panel).toHaveTextContent('48 YDS')
  expect(panel).toHaveTextContent('MIA 30')
})

test('the big moment banner shows within the last 3 plays and drops after', () => {
  const big = play(1, 'COOK RUSH, 45 YDS, TOUCHDOWN', { touchdown: true, yards: 45 })
  const moment: BigMoment = { kind: 'LONG_TD', play: big, text: big.summary }
  const recent = [play(0, 'A'), big, play(2, 'B'), play(3, 'C')]
  const { rerender } = render(<StatsPackage state={makeState()} tracker={trackerWith(recent, [moment])} names={names} />)
  expect(screen.getByTestId('big-moment')).toHaveTextContent('COOK RUSH, 45 YDS, TOUCHDOWN')
  const later = [...recent, play(4, 'D')]
  rerender(<StatsPackage state={makeState()} tracker={trackerWith(later, [moment])} names={names} />)
  expect(screen.queryByTestId('big-moment')).toBeNull()
})

test('the route replay slot draws the last play routes', () => {
  const points = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100 }))
  const last = play(1, 'ALLEN PASS TO KINCAID, 22 YDS', { routes: [{ slot: 3, points }] })
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), last])} names={names} />)
  expect(screen.getByTestId('route-replay-slot').querySelectorAll('path')).toHaveLength(1)
})

test('at the closing edge the last play panel draws the pending routes and waits for the summary', () => {
  const points = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100 }))
  const tracker = trackerWith([play(0, 'COOK RUSH, 3 YDS')])
  const pending = play(1, '', { routes: [{ slot: 3, points }] })
  vi.spyOn(tracker, 'latestPlay').mockReturnValue(pending)
  const { rerender } = render(<StatsPackage state={makeState()} tracker={tracker} names={names} />)
  const replay = screen.getByTestId('route-replay')
  expect(screen.getByTestId('route-replay-slot').querySelectorAll('path')).toHaveLength(1)
  expect(screen.getByTestId('last-play')).not.toHaveTextContent('COOK RUSH')
  vi.spyOn(tracker, 'latestPlay').mockReturnValue({ ...pending, summary: 'ALLEN PASS TO KINCAID, 16 YDS' })
  rerender(<StatsPackage state={makeState()} tracker={tracker} names={names} />)
  expect(screen.getByTestId('last-play')).toHaveTextContent('ALLEN PASS TO KINCAID, 16 YDS')
  expect(screen.getByTestId('route-replay')).toBe(replay)
})

test('the current drive shows KICKOFF and PAT instead of down and distance', () => {
  const { rerender } = render(<StatsPackage state={{ ...makeState(), playKind: 'kickoff', down: 1, yardsToGo: 21 }} tracker={trackerWith([])} names={names} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('KICKOFF AT MIA 30')
  rerender(<StatsPackage state={{ ...makeState(), isTry: true, down: 1, yardsToGo: 2 }} tracker={trackerWith([])} names={names} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('PAT AT MIA 30')
})

test('with no drive yet the drive title names the team holding the ball', () => {
  render(<StatsPackage state={{ ...makeState(), offense: 1, possession: 0 }} tracker={trackerWith([])} names={names} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('BUF BALL')
})
