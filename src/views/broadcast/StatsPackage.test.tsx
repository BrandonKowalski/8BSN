import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker, type BigMoment, type Drive, type PlayResult } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import { playerLabel } from '../../game/format'
import StatsPackage, { lastPlayMs, STATS_PAGE_MS } from './StatsPackage'

const css = readFileSync(join(__dirname, 'broadcast.css'), 'utf8')

function rule(selector: string): Record<string, string> | null {
  const block = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, head]) => head.split(',').map((s) => s.trim()).includes(selector))
  if (!block) return null
  return Object.fromEntries(
    block[2]
      .split(';')
      .map((d) => d.split(':').map((s) => s.trim()))
      .filter((d) => d.length === 2 && d[0] !== ''),
  )
}

const size = (selector: string) => parseFloat(rule(selector)?.['font-size'] ?? '0')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const NAMES = ['ALLEN', 'COOK', 'KINCAID', 'OLIVER', 'ACHANE']
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
      {
        id: 0,
        abbr: 'BUF',
        city: '',
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
        city: '',
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
  call: null,
  scramble: false,
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
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
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

const sectionIds = () => screen.getAllByTestId('stat-title').map((el) => (el.textContent ?? '').split(' ')[0])

test('the stats box opens on rushing and passing', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('the stats box switches to receiving and defense after six seconds and back', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  act(() => {
    vi.advanceTimersByTime(5999)
  })
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('the page indicator marks the current page and the timer stops on unmount', () => {
  vi.useFakeTimers()
  const { unmount } = render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const dots = () => [...screen.getByTestId('stats-pages').children].map((el) => el.classList.contains('pkg-dot-on'))
  expect(dots()).toEqual([true, false])
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(dots()).toEqual([false, true])
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

test('a fresh mount starts on page one', () => {
  vi.useFakeTimers()
  const first = render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  first.unmount()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('names use the full fit when the line has room', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#21 JAMES COOK RB')).toBe(true)
})

test('a stat line shows its player with the player tag', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const line = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')[0]
  const tag = within(line).getByTestId('player-tag')
  expect(tag.textContent).toBe(playerLabel(player(0, 1)!, 'full'))
  expect(tag.querySelector('.player-tag-pos')).toHaveTextContent('RB')
  expect(line.querySelector('.pkg-num')).toBeNull()
})

test('long names fall back to the initial fit and then the last name', () => {
  const long = (_team: 0 | 1, index: number) =>
    index === 1
      ? { first: 'Christopher', last: 'Vandenberg', number: 28, position: 'RB' as const }
      : index === 4
        ? { first: 'Christopher', last: 'Vandenbergensteinhausen', number: 30, position: 'RB' as const }
        : null
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={long} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#28 C. VANDENBERG RB')).toBe(true)
  expect(lines[1].textContent?.startsWith('#30 VANDENBERGENSTEINHAUSEN8CAR')).toBe(true)
})

test('receiving and defense lines show on page two', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(within(screen.getByTestId('stats-receiving')).getAllByTestId('stat-line')[0]).toHaveTextContent('4REC51YDS0YAC0TD')
  expect(within(screen.getByTestId('stats-defense')).getAllByTestId('stat-line')[0]).toHaveTextContent('2SK0INT')
})

test('rushing lines are sorted by yards and carry team totals', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const section = screen.getByTestId('stats-rushing')
  const lines = within(section).getAllByTestId('stat-line').map((el) => el.textContent)
  expect(lines[0]).toBe('#21 JAMES COOK RB11CAR74YDS1TD')
  expect(lines[1]).toBe('#24 JAMES ACHANE RB8CAR41YDS0TD')
  expect(within(section).getByTestId('stat-title')).toHaveTextContent('BUF74YDSMIA41YDS')
})

test('the last play panel has the route replay slot and the latest summary', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), play(1, 'ALLEN PASS TO KINCAID, 22 YDS')])} player={player} />)
  expect(screen.getByTestId('route-replay-slot')).toBeEmptyDOMElement()
  expect(screen.getByTestId('last-play-headline')).toHaveTextContent('ALLEN PASS TO KINCAID, 22 YDS')
})

test('the last play panel shows a quiet empty state before the first play', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const panel = screen.getByTestId('last-play')
  expect(within(panel).queryByTestId('route-replay-slot')).toBeNull()
  expect(within(panel).getByTestId('last-play-empty')).toHaveTextContent('NO PLAYS YET')
  expect(rule('.pkg-last-empty')?.['grid-area']).toBe('field')
  expect(rule('.pkg-last-empty')?.background).toBeUndefined()
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
  render(<StatsPackage state={makeState()} tracker={trackerWith([], [], drives)} player={player} />)
  const panel = screen.getByTestId('current-drive')
  expect(panel).toHaveTextContent('BUF DRIVE')
  expect(panel).toHaveTextContent('6 PLAYS')
  expect(panel).toHaveTextContent('48 YDS')
  expect(panel).toHaveTextContent('MIA 30')
})

test('the big play banner is gone', () => {
  const big = play(1, 'COOK RUSH, 45 YDS, TOUCHDOWN', { touchdown: true, yards: 45 })
  const moment: BigMoment = { kind: 'LONG_TD', play: big, text: big.summary }
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'A'), big], [moment])} player={player} />)
  expect(screen.queryByTestId('big-moment')).toBeNull()
  expect(document.body).not.toHaveTextContent('LONG TOUCHDOWN')
  expect(document.body).not.toHaveTextContent('BIG PLAY')
  expect(rule('.pkg-moment')).toBeNull()
})

test('last play fills the top half and stats page below', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'ALLEN PASS TO KINCAID, 22 YDS')])} player={player} />)
  const last = screen.getByTestId('last-play')
  const stats = screen.getByTestId('stats-pages').parentElement
  expect(last.compareDocumentPosition(stats!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(rule('.pkg-last')).toMatchObject({ left: '49cqw', right: '2cqw', top: '2cqh', height: '42cqh' })
  expect(rule('.pkg-stats')).toMatchObject({ left: '49cqw', right: '2cqw', top: '46cqh', height: '42cqh' })
  expect(rule('.replaying .pkg-last')).toMatchObject({ display: 'none' })
  expect(size('.pkg-line > *')).toBeGreaterThanOrEqual(3.8)
  expect(size('.pkg-section > .pkg-head')).toBeGreaterThanOrEqual(3.4)
  expect(size('.pkg-last .pkg-head')).toBeGreaterThanOrEqual(3.4)
  expect(size('.pkg-headline')).toBeGreaterThanOrEqual(3.8)
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  act(() => {
    vi.advanceTimersByTime(STATS_PAGE_MS)
  })
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  expect(last).toHaveTextContent('ALLEN PASS TO KINCAID, 22 YDS')
})

test('the result line shortens names to stay on one line', () => {
  const roster = (_team: 0 | 1, index: number) =>
    index === 0
      ? { first: 'Kirk', last: 'Cousins', number: 15, position: 'QB' as const }
      : index === 1
        ? { first: 'Davante', last: 'Adams', number: 11, position: 'WR' as const }
        : index === 2
          ? { first: 'James', last: 'Cook', number: 4, position: 'RB' as const }
          : null
  const long = play(0, 'X', { people: { passer: 0, receiver: 1 }, yards: 22 })
  const { rerender } = render(<StatsPackage state={makeState()} tracker={trackerWith([long])} player={roster} />)
  expect(screen.getByTestId('last-play-headline')).toHaveTextContent(/^K\. COUSINS 22 YARD PASS TO D\. ADAMS$/)
  const short = play(1, 'COOK RUSH, 5 YDS', { people: { rusher: 2 } })
  rerender(<StatsPackage state={makeState()} tracker={trackerWith([short])} player={roster} />)
  expect(screen.getByTestId('last-play-headline')).toHaveTextContent(/^JAMES COOK 5 YARD RUSH$/)
  expect(screen.getByTestId('last-play-headline').className).not.toContain('pkg-headline-wrap')
  const headline = rule('.pkg-headline') ?? {}
  expect(Object.keys(headline).some((k) => k.includes('line-clamp'))).toBe(false)
  expect(headline['text-overflow']).toBeUndefined()
  expect(headline['white-space']).toBe('nowrap')
  expect(rule('.pkg-headline-wrap')).toMatchObject({ 'white-space': 'normal' })
})

test('a name too long even by last name wraps instead of clipping', () => {
  const roster = (_team: 0 | 1, index: number) =>
    index === 0
      ? { first: 'Kirk', last: 'Cousins', number: 15, position: 'QB' as const }
      : index === 1
        ? { first: 'Marquez', last: 'Valdes-Scantling-Throckmorton-Smythe', number: 11, position: 'WR' as const }
        : null
  const long = play(0, 'X', { people: { passer: 0, receiver: 1 }, touchdown: true, yards: 34 })
  render(<StatsPackage state={makeState()} tracker={trackerWith([long])} player={roster} />)
  const headline = screen.getByTestId('last-play-headline')
  expect(headline).toHaveTextContent(/^COUSINS 34 YARD TOUCHDOWN PASS TO VALDES-SCANTLING-THROCKMORTON-SMYTHE$/)
  expect(headline.className).toContain('pkg-headline-wrap')
})

test('the last play panel has no wordmark and the field fills the box', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS')])} player={player} />)
  const panel = screen.getByTestId('last-play')
  expect(panel.querySelector('.wordmark')).toBeNull()
  expect(panel.querySelector('.pkg-brand')).toBeNull()
  expect(panel).toHaveTextContent('LAST PLAY')
  expect(rule('.pkg-brand')).toBeNull()
  expect(rule('.pkg-last')).toMatchObject({ 'grid-template-rows': 'auto auto minmax(0, 1fr)' })
  expect(rule('.pkg-replay')).toMatchObject({ height: '100%', 'grid-area': 'field' })
  expect(parseFloat(rule('.pkg-last')?.['padding'] ?? '99')).toBeLessThanOrEqual(1)
})

test('the route replay slot draws the last play ball path', () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100, slot: 1 }))
  const last = play(1, 'COOK RUSH, 15 YDS', { ball })
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), last])} player={player} />)
  expect(screen.getAllByTestId('ball-path')).toHaveLength(1)
})

test('at the closing edge the last play panel draws the pending ball path and waits for the summary', () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100, slot: 1 }))
  const tracker = trackerWith([play(0, 'COOK RUSH, 3 YDS')])
  const pending = play(1, '', { ball })
  vi.spyOn(tracker, 'latestPlay').mockReturnValue(pending)
  const { rerender } = render(<StatsPackage state={makeState()} tracker={tracker} player={player} />)
  const replay = screen.getByTestId('route-replay')
  expect(screen.getAllByTestId('ball-path')).toHaveLength(1)
  expect(screen.getByTestId('last-play')).not.toHaveTextContent('COOK RUSH')
  vi.spyOn(tracker, 'latestPlay').mockReturnValue({ ...pending, summary: 'ALLEN PASS TO KINCAID, 16 YDS' })
  rerender(<StatsPackage state={makeState()} tracker={tracker} player={player} />)
  expect(screen.getByTestId('last-play')).toHaveTextContent('ALLEN PASS TO KINCAID, 16 YDS')
  expect(screen.getByTestId('route-replay')).toBe(replay)
})

test('the current drive shows KICKOFF and the try instead of down and distance', () => {
  const { rerender } = render(<StatsPackage state={{ ...makeState(), playKind: 'kickoff', down: 1, yardsToGo: 21 }} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('KICKOFF AT MIA 30')
  rerender(<StatsPackage state={{ ...makeState(), isTry: true, down: 1, yardsToGo: 2 }} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('TRY AT MIA 30')
  rerender(<StatsPackage state={{ ...makeState(), live: true, playKind: 'extraPoint', isTry: true, down: 1, yardsToGo: 2 }} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('PAT AT MIA 30')
})

test('with no drive yet the drive title names the team holding the ball', () => {
  render(<StatsPackage state={{ ...makeState(), offense: 1, possession: 0 }} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('current-drive')).toHaveTextContent('BUF BALL')
})

test('every stat value carries its unit and zero values are dimmed', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={player} />)
  const passing = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0]
  const units = [...passing.querySelectorAll('.pkg-unit')].map((el) => el.textContent)
  expect(units).toEqual(['C/A', 'YDS', 'AIR', 'TD', 'INT'])
  expect(passing).toHaveTextContent('11/17C/A142YDS0AIR0TD1INT')
  expect(passing.querySelectorAll('.pkg-zero')).toHaveLength(2)
})

test('stat lines show the jersey number and the name', () => {
  const cook = (_team: 0 | 1, index: number) => (index === 1 ? { first: 'James', last: 'Cook', number: 28, position: 'RB' as const } : null)
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} player={cook} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#28 JAMES COOK RB')).toBe(true)
})

test('receivers show YAC and passers show air yards', () => {
  vi.useFakeTimers()
  const catches = [
    play(0, 'A', { thrown: true, yards: 22, people: { passer: 0, receiver: 2 }, airYards: 14, yac: 8 }),
    play(1, 'B', { thrown: true, yards: 9, people: { passer: 0, receiver: 2 }, airYards: -2, yac: 11 }),
    play(2, 'C', { thrown: true, yards: 0, people: { passer: 0 } }),
    play(3, 'D', { offense: 1, thrown: true, yards: 6, people: { passer: 0, receiver: 2 }, airYards: 6, yac: 0 }),
  ]
  render(<StatsPackage state={makeState()} tracker={trackerWith(catches)} player={player} />)
  expect(within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0]).toHaveTextContent('11/17C/A142YDS12AIR0TD1INT')
  act(() => {
    vi.advanceTimersByTime(STATS_PAGE_MS)
  })
  const receiving = screen.getByTestId('stats-receiving')
  expect(within(receiving).getAllByTestId('stat-line')[0]).toHaveTextContent('4REC51YDS19YAC0TD')
  expect(within(receiving).getByTestId('stat-title')).toHaveTextContent('RECEIVING BUF51YDS19YAC')
  expect(within(receiving).getByTestId('stat-title')).not.toHaveTextContent('MIA')
  expect(within(receiving).getByTestId('stat-title')).not.toHaveTextContent('LONG')
})

test('a passing line with late game numbers picks a shorter name fit instead of clipping', () => {
  const state = makeState()
  state.teams[0].players = [{ rosterIndex: 0, pass: { att: 41, comp: 29, yds: 312, td: 3, int: 2 } }]
  state.teams[1].players = [{ rosterIndex: 0, pass: { att: 9, comp: 4, yds: 31, td: 0, int: 0 } }]
  const roster = (team: 0 | 1, index: number) =>
    index === 0 ? { first: team === 0 ? 'Deshaun' : 'Christian', last: team === 0 ? 'Watsonsmith' : 'Watson', number: 4, position: 'QB' as const } : null
  const catches = [play(0, 'A', { thrown: true, yards: 312, people: { passer: 0, receiver: 1 }, airYards: 188, yac: 124 })]
  render(<StatsPackage state={state} tracker={trackerWith(catches)} player={roster} />)
  const lines = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')
  expect(lines[0]).toHaveTextContent(/^#4 WATSONSMITH29\/41C\/A312YDS188AIR3TD2INT$/)
  expect(lines[1].textContent?.startsWith('#4 C. WATSON QB4/9C/A')).toBe(true)
})

test('the name fit leaves room for the widest value in every column', () => {
  const state = makeState()
  state.teams[0].players = [{ rosterIndex: 2, rec: { rec: 11, yds: 164, td: 2 } }]
  state.teams[1].players = [{ rosterIndex: 2, rec: { rec: 1, yds: 4, td: 0 } }]
  const roster = (team: 0 | 1, index: number) =>
    index === 2 ? { first: 'Christian', last: team === 0 ? 'Watson' : 'Kirkpatrick', number: 88, position: 'WR' as const } : null
  vi.useFakeTimers()
  render(<StatsPackage state={state} tracker={trackerWith([play(0, 'A', { offense: 0, people: { passer: 0, receiver: 2 }, airYards: 41, yac: 123 })])} player={roster} />)
  act(() => {
    vi.advanceTimersByTime(STATS_PAGE_MS)
  })
  const lines = within(screen.getByTestId('stats-receiving')).getAllByTestId('stat-line').map((l) => l.textContent)
  expect(lines[0]).toBe('#88 C. WATSON WR11REC164YDS123YAC2TD')
  expect(lines[1]).toBe('#88 C. KIRKPATRICK WR1REC4YDS0YAC0TD')
})

test('a last name too long for the room is set smaller instead of clipped', () => {
  const state = makeState()
  state.teams[0].players = [{ rosterIndex: 0, pass: { att: 41, comp: 29, yds: 312, td: 3, int: 2 } }]
  state.teams[1].players = []
  const roster = (_team: 0 | 1, index: number) => (index === 0 ? { first: 'Marquez', last: 'Valdes-Scantling', number: 11, position: 'QB' as const } : null)
  render(<StatsPackage state={state} tracker={trackerWith([])} player={roster} />)
  const name = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0].querySelector('.pkg-name') as HTMLElement
  expect(name).toHaveTextContent('VALDES-SCANTLING')
  expect(parseFloat(name.style.fontSize)).toBeLessThan(4)
  expect(parseFloat(name.style.fontSize)).toBeGreaterThan(2)
})

const spread = (i: number) => ({ x: 0x800 - 200 + i * 12, y: 0x20 + (i % 11) * 14 })
const rowAt = (qb: { x: number; y: number }) => Array.from({ length: 22 }, (_, i) => (i === 0 ? qb : spread(i)))
const qbAt = (i: number) => ({ x: 0x800 - 16 - i * 8, y: 0x70 })
const allTracks = { frames: [100, 130, 160, 190, 220], players: [0, 1, 2, 3, 4].map((i) => rowAt(qbAt(i))) }

function animate() {
  const queue = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.stubGlobal('requestAnimationFrame', (tick: FrameRequestCallback) => {
    queue.set(++next, tick)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  return {
    queue,
    step: (now: number) =>
      act(() => {
        const due = [...queue.values()]
        queue.clear()
        for (const tick of due) tick(now)
      }),
  }
}

const centerOf = (el: Element) => ({ x: Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2, y: Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2 })
const ringOf = () => {
  const ring = screen.getByTestId('topdown-carrier')
  return { x: Number(ring.getAttribute('cx')), y: Number(ring.getAttribute('cy')) }
}

test('all 22 marks the ball carrier and flies the ball on passes', () => {
  const { step } = animate()
  const from = qbAt(2)
  const to = { x: 0x800 + 100, y: 0x48 }
  const incomplete = play(0, 'ALLEN PASS INCOMPLETE', {
    thrown: true,
    yards: 0,
    people: { passer: 0 },
    tracks: allTracks,
    ball: [0, 1, 2].map((i) => ({ ...qbAt(i), slot: 0 })),
    pass: { from, to, outcome: 'incomplete', frames: [160, 200], target: null },
  })
  render(<StatsPackage state={makeState()} tracker={trackerWith([incomplete])} player={player} />)
  step(0)
  expect(screen.getByTestId('topdown')).toBeInTheDocument()
  expect(screen.queryByTestId('route-replay')).toBeNull()
  expect(ringOf()).toEqual(qbAt(0))
  expect(screen.getByTestId('topdown-carrier')).toHaveClass('topdown-carrier')
  expect(Math.abs(centerOf(screen.getByTestId('topdown-football')).x - qbAt(0).x)).toBeLessThan(16)
  step(1500)
  expect(screen.queryByTestId('topdown-carrier')).toBeNull()
  const flying = centerOf(screen.getByTestId('topdown-football'))
  expect(flying.x).toBeCloseTo(from.x + (to.x - from.x) * 0.75, 1)
  expect(flying.y).toBeCloseTo(from.y + (to.y - from.y) * 0.75, 1)
  expect(screen.queryByTestId('pass-x')).toBeNull()
  step(2000)
  const landed = centerOf(screen.getByTestId('topdown-football'))
  expect(landed.x).toBeCloseTo(to.x, 1)
  expect(landed.y).toBeCloseTo(to.y, 1)
  expect(screen.getByTestId('pass-x')).toBeInTheDocument()
  expect(screen.queryByTestId('topdown-carrier')).toBeNull()
})

test('the all 22 panel loops after a short hold on the last frame', () => {
  const { step, queue } = animate()
  const sack = play(0, 'SACK, -7 YDS', { sack: true, yards: -7, tracks: allTracks, ball: [0, 1, 2, 3, 4].map((i) => ({ ...qbAt(i), slot: 0 })) })
  render(<StatsPackage state={makeState()} tracker={trackerWith([sack])} player={player} />)
  const panel = screen.getByTestId('last-play')
  expect(within(panel).getByTestId('last-play-view')).toHaveTextContent(/^ALL 22$/)
  step(0)
  expect(ringOf()).toEqual(qbAt(0))
  step(2000)
  expect(ringOf()).toEqual(qbAt(4))
  step(3400)
  expect(ringOf()).toEqual(qbAt(4))
  expect(panel.querySelector('.topdown-trail')?.getAttribute('d')?.match(/[ML]/g)).toHaveLength(3)
  step(3600)
  expect(ringOf()).toEqual(qbAt(0))
  step(5600)
  expect(ringOf()).toEqual(qbAt(4))
  step(7200)
  expect(ringOf()).toEqual(qbAt(0))
  expect(queue.size).toBe(1)
})

test('the all 22 loop stops while a replay covers the panel and starts again after it', () => {
  const { step, queue } = animate()
  const sack = play(0, 'SACK, -7 YDS', { sack: true, yards: -7, tracks: allTracks, ball: [0, 1, 2, 3, 4].map((i) => ({ ...qbAt(i), slot: 0 })) })
  const tracker = trackerWith([sack])
  const { rerender } = render(<StatsPackage state={makeState()} tracker={tracker} player={player} />)
  step(0)
  expect(queue.size).toBe(1)
  rerender(<StatsPackage state={makeState()} tracker={tracker} player={player} covered />)
  expect(queue.size).toBe(0)
  step(5000)
  expect(queue.size).toBe(0)
  rerender(<StatsPackage state={makeState()} tracker={tracker} player={player} />)
  expect(queue.size).toBe(1)
})

test('a completed pass puts the air and yac key above the diagram', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'A', { thrown: true, yards: 22, people: { passer: 0, receiver: 2 }, airYards: 14, yac: 8 })])} player={player} />)
  const key = within(screen.getByTestId('last-play')).getByTestId('air-key')
  expect(key.closest('h2')).not.toBeNull()
  expect(key).toHaveTextContent('AIR 14 YDS')
  expect(key).toHaveTextContent('YAC 8 YDS')
  expect(key.querySelectorAll('.air-swatch')).toHaveLength(2)
  expect(screen.getByTestId('route-replay-slot').querySelector('[data-testid="air-key"]')).toBeNull()
})

test('a run in the last play box stays on the telestrator with no view label', () => {
  const ball = Array.from({ length: 16 }, (_, i) => ({ x: 0x800 + i * 8, y: 100, slot: 1 }))
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 15 YDS', { ball, tracks: allTracks, people: { rusher: 1 } })])} player={player} />)
  expect(screen.getByTestId('route-replay')).toBeInTheDocument()
  expect(screen.queryByTestId('topdown')).toBeNull()
  expect(screen.queryByTestId('last-play-view')).toBeNull()
  expect(screen.queryByTestId('air-key')).toBeNull()
})

function withPlayers(a: GameState['teams'][0]['players'], b: GameState['teams'][0]['players']): GameState {
  const state = makeState()
  state.teams[0].players = a
  state.teams[1].players = b
  return state
}

const dots = () => [...screen.getByTestId('stats-pages').children].map((el) => el.classList.contains('pkg-dot-on'))

test('sections with no players are hidden', () => {
  const state = withPlayers([{ rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } }], [{ rosterIndex: 3, def: { sacks: 2, int: 0 } }])
  render(<StatsPackage state={state} tracker={trackerWith([])} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING'])
  expect(screen.queryByTestId('stats-passing')).toBeNull()
})

test('zero team totals are left out of the title', () => {
  const state = withPlayers([{ rosterIndex: 1, rush: { att: 3, yds: 0, td: 0 } }], [{ rosterIndex: 4, rush: { att: 8, yds: 41, td: 0 } }])
  render(<StatsPackage state={state} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('stat-title')).toHaveTextContent('RUSHING MIA41YDS')
  expect(screen.getByTestId('stat-title')).not.toHaveTextContent('BUF')
})

test('both totals zero leaves the title without figures and a negative total stays', () => {
  const zero = withPlayers([{ rosterIndex: 1, rush: { att: 3, yds: 0, td: 0 } }], [{ rosterIndex: 4, rush: { att: 2, yds: 0, td: 0 } }])
  const first = render(<StatsPackage state={zero} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('stat-title').textContent?.trim()).toBe('RUSHING')
  first.unmount()
  const negative = withPlayers([{ rosterIndex: 1, rush: { att: 3, yds: -12, td: 0 } }], [])
  render(<StatsPackage state={negative} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('stat-title')).toHaveTextContent('BUF-12YDS')
})

test('an empty page is skipped and its dot removed', () => {
  vi.useFakeTimers()
  const state = withPlayers([{ rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } }], [])
  render(<StatsPackage state={state} tracker={trackerWith([])} player={player} />)
  expect(dots()).toEqual([true])
  act(() => {
    vi.advanceTimersByTime(12000)
  })
  expect(sectionIds()).toEqual(['RUSHING'])
  expect(dots()).toEqual([true])
})

test('the page index stays valid when a page disappears and returns', () => {
  vi.useFakeTimers()
  const full = makeState()
  const early = withPlayers([{ rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } }], [])
  const view = render(<StatsPackage state={full} tracker={trackerWith([])} player={player} />)
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  view.rerender(<StatsPackage state={early} tracker={trackerWith([])} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING'])
  expect(dots()).toEqual([true])
  view.rerender(<StatsPackage state={full} tracker={trackerWith([])} player={player} />)
  expect(dots()).toHaveLength(2)
  expect(dots().filter(Boolean)).toHaveLength(1)
})

test('with no stats at all the box shows one quiet line', () => {
  render(<StatsPackage state={withPlayers([], [])} tracker={trackerWith([])} player={player} />)
  expect(screen.getByTestId('stats-empty')).toHaveTextContent('NO STATS YET')
  expect(screen.queryAllByTestId('stat-title')).toHaveLength(0)
  expect(screen.getByTestId('stats-pages').children).toHaveLength(0)
  expect(rule('.pkg-stats-empty')?.['color']).toBeTruthy()
  expect(rule('.pkg-stats-empty')?.['text-align']).toBe('center')
})

test('L1 and R1 page the stats box between plays', () => {
  vi.useFakeTimers()
  const at = (paging: { by: -1 | 1; n: number }) => <StatsPackage state={makeState()} tracker={trackerWith([])} player={player} paging={paging} />
  const view = render(at({ by: 1, n: 0 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  act(() => {
    vi.advanceTimersByTime(4000)
  })
  view.rerender(at({ by: 1, n: 1 }))
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  act(() => {
    vi.advanceTimersByTime(STATS_PAGE_MS - 1)
  })
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  view.rerender(at({ by: -1, n: 2 }))
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  view.rerender(at({ by: -1, n: 3 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  view.rerender(at({ by: -1, n: 3 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  view.unmount()
  render(at({ by: -1, n: 3 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  cleanup()
  const one = withPlayers([{ rosterIndex: 1, rush: { att: 11, yds: 74, td: 1 } }], [])
  const single = render(<StatsPackage state={one} tracker={trackerWith([])} player={player} paging={{ by: -1, n: 0 }} />)
  single.rerender(<StatsPackage state={one} tracker={trackerWith([])} player={player} paging={{ by: -1, n: 1 }} />)
  expect(sectionIds()).toEqual(['RUSHING'])
  expect(dots()).toEqual([true])
})

test('L1 and R1 page the stats box under strict mode', () => {
  vi.useFakeTimers()
  const at = (paging: { by: -1 | 1; n: number }) => (
    <StrictMode>
      <StatsPackage state={makeState()} tracker={trackerWith([])} player={player} paging={paging} />
    </StrictMode>
  )
  const view = render(at({ by: 1, n: 0 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  view.rerender(at({ by: 1, n: 1 }))
  expect(sectionIds()).toEqual(['RECEIVING', 'DEFENSE'])
  view.rerender(at({ by: -1, n: 2 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
  view.rerender(at({ by: -1, n: 2 }))
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('L2 restarts the last play All 22', () => {
  const { step } = animate()
  const sack = play(0, 'SACK, -7 YDS', { sack: true, yards: -7, tracks: allTracks, ball: [0, 1, 2, 3, 4].map((i) => ({ ...qbAt(i), slot: 0 })) })
  const at = (restart: number) => <StatsPackage state={makeState()} tracker={trackerWith([sack])} player={player} restart={restart} />
  const view = render(at(0))
  step(0)
  step(2000)
  expect(ringOf()).toEqual(qbAt(4))
  vi.mocked(performance.now).mockReturnValue(2000)
  view.rerender(at(1))
  step(2000)
  expect(ringOf()).toEqual(qbAt(0))
  step(4000)
  expect(ringOf()).toEqual(qbAt(4))
})

test('a replay takes the whole right column', () => {
  expect(rule('.replay')).toMatchObject({ left: '49cqw', right: '2cqw', top: '2cqh', height: '86cqh' })
  expect(rule('.replaying .pkg-stats')).toMatchObject({ display: 'none' })
  expect(rule('.replaying .pkg-last')).toMatchObject({ display: 'none' })
  expect(rule('.replay-picture')?.['width']).toBe('min(100%, calc(var(--replay-picture-h) * 8 / 7))')
  expect(rule('.replay-footage')).toBeNull()
  expect(rule('.replay')?.['--replay-picture-h']).toBe('68cqh')
  expect(rule('.replay-picture')?.['height']).toBeUndefined()
  expect(rule('.replay-head')?.['justify-content']).toBe('center')
  expect(rule('.replay-look')).toBeNull()
  expect(size('.replay-caption')).toBeGreaterThanOrEqual(3.8)
  expect(size('.replay-caption')).toBeLessThanOrEqual(4)
})

test('the replay window packs the title, stat strip, picture and caption to the top with even gaps', () => {
  expect(rule('.replay-picture-fill')).toBeNull()
  expect(rule('.replay')).toMatchObject({ display: 'flex', 'flex-direction': 'column', gap: '0.8cqh' })
  expect(rule('.replay')?.['justify-content']).toBeUndefined()
  for (const part of ['.replay-head', '.replay-stats', '.replay-picture', '.replay-caption']) {
    expect(rule(part)?.['margin-top']).toBeUndefined()
    expect(rule(part)?.['margin-bottom']).toBeUndefined()
  }
  expect(rule('.replay-stats')).toMatchObject({ flex: 'none', display: 'flex', 'justify-content': 'center' })
  expect(rule('.replay-stat-unit')?.['color']).toBe(rule('.pkg-unit')?.['color'])
  expect(rule('.replay-caption')?.['flex']).toBe('none')
  expect(rule('.replay-caption')?.['overflow']).toBe('hidden')
})

test('the team sliver matches the text height', () => {
  expect(rule('.pkg-chip')).toMatchObject({ height: '0.72em', 'vertical-align': 'baseline' })
  expect(rule('.pkg-chip')?.['width']).toMatch(/em$/)
  expect(rule('.pkg-headline .pkg-chip')).toBeNull()
  const state = makeState()
  state.teams[0].players = [{ rosterIndex: 0, pass: { att: 41, comp: 29, yds: 312, td: 3, int: 2 } }]
  const roster = (_team: 0 | 1, index: number) => (index === 0 ? { first: 'Marquez', last: 'Valdes-Scantling', number: 11, position: 'QB' as const } : null)
  render(<StatsPackage state={state} tracker={trackerWith([play(0, 'ALLEN PASS TO KINCAID, 22 YDS')])} player={roster} />)
  const name = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0].querySelector('.pkg-name') as HTMLElement
  expect(name.style.fontSize).not.toBe('')
  expect(name.firstElementChild).toHaveClass('pkg-chip')
  expect(screen.getByTestId('last-play-headline').firstElementChild).toHaveClass('pkg-chip')
})

test('the last play graphic lasts as long as the All-22 playback, or nothing when there is nothing to draw', () => {
  const sample = Array.from({ length: 22 }, () => ({ x: 0x800, y: 100 }))
  const sacked = play(1, 'SACK', { sack: true, tracks: { frames: [100, 280], players: [sample, sample] } })
  expect(lastPlayMs(sacked)).toBe(3000)
  expect(lastPlayMs(play(2, 'RUN'))).toBe(0)
  expect(lastPlayMs(null)).toBe(0)
})
