import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker, type BigMoment, type Drive, type PlayResult } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import { playerLabel } from '../../game/format'
import StatsPackage, { STATS_PAGE_MS } from './StatsPackage'

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
    carrierRoster: null,
    fumbled: false,
    ballInAir: null,
    deflected: false,
    deflector: null,
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
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('the stats box switches to receiving and defense after six seconds and back', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
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
  const { unmount } = render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
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
  const first = render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  first.unmount()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  expect(sectionIds()).toEqual(['RUSHING', 'PASSING'])
})

test('names use the full fit when the line has room', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#21 JAMES COOK RB')).toBe(true)
})

test('a stat line shows its player with the player tag', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
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
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={long} />)
  const lines = within(screen.getByTestId('stats-rushing')).getAllByTestId('stat-line')
  expect(lines[0].textContent?.startsWith('#28 C. VANDENBERG RB')).toBe(true)
  expect(lines[1].textContent?.startsWith('#30 VANDENBERGENSTEINHAUSEN8CAR')).toBe(true)
})

test('receiving and defense lines show on page two', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  act(() => {
    vi.advanceTimersByTime(6000)
  })
  expect(within(screen.getByTestId('stats-receiving')).getAllByTestId('stat-line')[0]).toHaveTextContent('4REC51YDS0YAC0TD')
  expect(within(screen.getByTestId('stats-defense')).getAllByTestId('stat-line')[0]).toHaveTextContent('2SK0INT')
})

test('rushing lines are sorted by yards and carry team totals', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={player} />)
  const section = screen.getByTestId('stats-rushing')
  const lines = within(section).getAllByTestId('stat-line').map((el) => el.textContent)
  expect(lines[0]).toBe('#21 JAMES COOK RB11CAR74YDS1TD')
  expect(lines[1]).toBe('#24 JAMES ACHANE RB8CAR41YDS0TD')
  expect(within(section).getByTestId('stat-title')).toHaveTextContent('BUF74YDSMIA41YDS')
})

test('the last play panel has the route replay slot and the latest summary', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS'), play(1, 'ALLEN PASS TO KINCAID, 22 YDS')])} names={names} player={player} />)
  expect(screen.getByTestId('route-replay-slot')).toBeEmptyDOMElement()
  expect(screen.getByTestId('last-play-headline')).toHaveTextContent('ALLEN PASS TO KINCAID, 22 YDS')
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

test('the big play banner is gone', () => {
  const big = play(1, 'COOK RUSH, 45 YDS, TOUCHDOWN', { touchdown: true, yards: 45 })
  const moment: BigMoment = { kind: 'LONG_TD', play: big, text: big.summary }
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'A'), big], [moment])} names={names} player={player} />)
  expect(screen.queryByTestId('big-moment')).toBeNull()
  expect(document.body).not.toHaveTextContent('LONG TOUCHDOWN')
  expect(document.body).not.toHaveTextContent('BIG PLAY')
  expect(rule('.pkg-moment')).toBeNull()
})

test('last play fills the top half and stats page below', () => {
  vi.useFakeTimers()
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'ALLEN PASS TO KINCAID, 22 YDS')])} names={names} player={player} />)
  const last = screen.getByTestId('last-play')
  const stats = screen.getByTestId('stats-pages').parentElement
  expect(last.compareDocumentPosition(stats!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(rule('.pkg-last')).toMatchObject({ left: '49cqw', right: '2cqw', top: '2cqh', height: '42cqh' })
  expect(rule('.pkg-stats')).toMatchObject({ left: '49cqw', right: '2cqw', top: '46cqh', height: '42cqh' })
  expect(rule('.replay')).toMatchObject({ left: '49cqw', right: '2cqw', top: '2cqh', height: '42cqh' })
  expect(rule('.replaying .pkg-last')).toMatchObject({ display: 'none' })
  expect(rule('.replaying .pkg-stats')).toBeNull()
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
  const { rerender } = render(<StatsPackage state={makeState()} tracker={trackerWith([long])} names={names} player={roster} />)
  expect(screen.getByTestId('last-play-headline')).toHaveTextContent(/^K\. COUSINS 22 YARD PASS TO D\. ADAMS$/)
  const short = play(1, 'COOK RUSH, 5 YDS', { people: { rusher: 2 } })
  rerender(<StatsPackage state={makeState()} tracker={trackerWith([short])} names={names} player={roster} />)
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
  render(<StatsPackage state={makeState()} tracker={trackerWith([long])} names={names} player={roster} />)
  const headline = screen.getByTestId('last-play-headline')
  expect(headline).toHaveTextContent(/^COUSINS 34 YARD TOUCHDOWN PASS TO VALDES-SCANTLING-THROCKMORTON-SMYTHE$/)
  expect(headline.className).toContain('pkg-headline-wrap')
})

test('the last play panel has no wordmark and the field fills the box', () => {
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, 'COOK RUSH, 3 YDS')])} names={names} player={player} />)
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
  expect(units).toEqual(['C/A', 'YDS', 'AIR', 'TD', 'INT'])
  expect(passing).toHaveTextContent('11/17C/A142YDS0AIR0TD1INT')
  expect(passing.querySelectorAll('.pkg-zero')).toHaveLength(2)
})

test('stat lines show the jersey number and the name', () => {
  const cook = (_team: 0 | 1, index: number) => (index === 1 ? { first: 'James', last: 'Cook', number: 28, position: 'RB' as const } : null)
  render(<StatsPackage state={makeState()} tracker={trackerWith([])} names={names} player={cook} />)
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
  render(<StatsPackage state={makeState()} tracker={trackerWith(catches)} names={names} player={player} />)
  expect(within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0]).toHaveTextContent('11/17C/A142YDS12AIR0TD1INT')
  act(() => {
    vi.advanceTimersByTime(STATS_PAGE_MS)
  })
  const receiving = screen.getByTestId('stats-receiving')
  expect(within(receiving).getAllByTestId('stat-line')[0]).toHaveTextContent('4REC51YDS19YAC0TD')
  expect(within(receiving).getByTestId('stat-title')).toHaveTextContent('BUF51YDS19YACMIA0YDS0YAC')
  expect(within(receiving).getByTestId('stat-title')).not.toHaveTextContent('LONG')
})

test('a passing line with late game numbers picks a shorter name fit instead of clipping', () => {
  const state = makeState()
  state.teams[0].players = [{ rosterIndex: 0, pass: { att: 41, comp: 29, yds: 312, td: 3, int: 2 } }]
  state.teams[1].players = [{ rosterIndex: 0, pass: { att: 9, comp: 4, yds: 31, td: 0, int: 0 } }]
  const roster = (team: 0 | 1, index: number) =>
    index === 0 ? { first: team === 0 ? 'Deshaun' : 'Christian', last: team === 0 ? 'Watsonsmith' : 'Watson', number: 4, position: 'QB' as const } : null
  const catches = [play(0, 'A', { thrown: true, yards: 312, people: { passer: 0, receiver: 1 }, airYards: 188, yac: 124 })]
  render(<StatsPackage state={state} tracker={trackerWith(catches)} names={names} player={roster} />)
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
  render(<StatsPackage state={state} tracker={trackerWith([play(0, 'A', { offense: 0, people: { passer: 0, receiver: 2 }, airYards: 41, yac: 123 })])} names={names} player={roster} />)
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
  render(<StatsPackage state={state} tracker={trackerWith([])} names={names} player={roster} />)
  const name = within(screen.getByTestId('stats-passing')).getAllByTestId('stat-line')[0].querySelector('.pkg-name') as HTMLElement
  expect(name).toHaveTextContent('VALDES-SCANTLING')
  expect(parseFloat(name.style.fontSize)).toBeLessThan(4)
  expect(parseFloat(name.style.fontSize)).toBeGreaterThan(2)
})
