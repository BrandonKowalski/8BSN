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
const player = (_team: 0 | 1, index: number) =>
  NAMES[index] ? { first: 'James', last: `${NAMES[index][0]}${NAMES[index].slice(1).toLowerCase()}`, number: 20 + index, position: 'RB' as const } : null

function makeState(): GameState {
  return {
    inGame: true,
    inBreak: false,
    live: false,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
    thrown: false,
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
    playSelect: false,
    betweenPlays: false,
    carrier: null,
    field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
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
  thrown: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary,
  startFrame: 0,
  endFrame: 0,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
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
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  const titles = screen.getAllByTestId('stat-title').map((el) => el.textContent ?? '')
  expect(titles.map((t) => t.split(' ')[0])).toEqual(['RUSHING', 'PASSING', 'RECEIVING', 'DEFENSE'])
})

test('rushing lines are sorted by yards and carry team totals', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  const section = screen.getByTestId('stats-rushing')
  const lines = within(section).getAllByTestId('stat-line').map((el) => el.textContent)
  expect(lines[0]).toBe('#21J. COOK11CAR74YDS1TD')
  expect(lines[1]).toBe('#24J. ACHANE8CAR41YDS0TD')
  expect(within(section).getByTestId('stat-title')).toHaveTextContent('BUF74YDSMIA41YDS')
})

test('the last play panel has the route replay slot and the latest summary', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), play(1, 'ALLEN PASS TO KINCAID, 22 YDS')])} names={names} player={player} />)
  expect(screen.getByTestId('route-replay-slot')).toBeEmptyDOMElement()
  expect(screen.getByTestId('last-play')).toHaveTextContent('ALLEN PASS TO KINCAID, 22 YDS')
})

test('the current drive shows plays, yards and the spot', () => {
  const drives: Drive[] = [
    {
      offense: 0,
      plays: 6,
      yards: 48,
      startClock: '7:02',
      result: 'IN_PROGRESS',
      startSpot: { yard: 30, side: 0 },
      endSpot: { yard: 30, side: 1 },
      endSummary: 'COOK RUSH, 4 YDS',
      endTime: '3:10',
    },
  ]
  render(<StatsPackage state={makeState()} tracker={trackerWith([], [], drives)} names={names} player={player} />)
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
  const { rerender } = render(<StatsPackage state={makeState()} tracker={trackerWith(recent, [moment])} names={names} player={player} />)
  expect(screen.getByTestId('big-moment')).toHaveTextContent('COOK RUSH, 45 YDS, TOUCHDOWN')
  const later = [...recent, play(4, 'D')]
  rerender(<StatsPackage state={makeState()} tracker={trackerWith(later, [moment])} names={names} player={player} />)
  expect(screen.queryByTestId('big-moment')).toBeNull()
})

test('the route replay slot draws the last play ball path', () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100, slot: 1 }))
  const last = play(1, 'COOK RUSH, 15 YDS', { ball })
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), last])} names={names} player={player} />)
  expect(screen.getAllByTestId('ball-path')).toHaveLength(1)
})

test('at the closing edge the last play panel draws the pending ball path and waits for the summary', () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100, slot: 1 }))
  const tracker = trackerWith([play(0, 'COOK RUSH, 3 YDS')])
  const pending = play(1, '', { ball })
  vi.spyOn(tracker, 'latestPlay').mockReturnValue(pending)
  const { rerender } = render(<StatsPackage state={makeState()} tracker={tracker} names={names} player={player} />)
  const replay = screen.getByTestId('route-replay')
  expect(screen.getAllByTestId('ball-path')).toHaveLength(1)
  expect(screen.getByTestId('last-play')).not.toHaveTextContent('COOK RUSH')
  vi.spyOn(tracker, 'latestPlay').mockReturnValue({ ...pending, summary: 'ALLEN PASS TO KINCAID, 16 YDS' })
  rerender(<StatsPackage state={makeState()} tracker={tracker} names={names} player={player} />)
  expect(screen.getByTestId('last-play')).toHaveTextContent('ALLEN PASS TO KINCAID, 16 YDS')
  expect(screen.getByTestId('route-replay')).toBe(replay)
})

test('the current drive shows KICKOFF and PAT instead of down and distance', () => {
  const { rerender } = render(<StatsPackage state={{ ...makeState(), playKind: 'kickoff', down: 1, yardsToGo: 21 }} tracker={trackerWith([])} names={names} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('KICKOFF AT MIA 30')
  rerender(<StatsPackage state={{ ...makeState(), isTry: true, down: 1, yardsToGo: 2 }} tracker={trackerWith([])} names={names} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('PAT AT MIA 30')
})

test('with no drive yet the drive title names the team holding the ball', () => {
  render(<StatsPackage state={{ ...makeState(), offense: 1, possession: 0 }} tracker={trackerWith([])} names={names} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('BUF BALL')
})

test('every stat value carries its unit and zero values are dimmed', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  const passing = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0]
  const units = [...passing.querySelectorAll('.pkg-unit')].map((el) => el.textContent)
  expect(units).toEqual(['C/A', 'YDS', 'TD', 'INT'])
  expect(passing).toHaveTextContent('11/17C/A142YDS0TD1INT')
  expect(passing.querySelectorAll('.pkg-zero')).toHaveLength(1)
})

test('stat lines show the jersey number and the initial name', () => {
  const cook = (_team: 0 | 1, index: number) => (index === 1 ? { first: 'James', last: 'Cook', number: 28, position: 'RB' as const } : null)
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={cook} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#28J. COOK')).toBe(true)
})
