import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker, type Drive, type PlayResult } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import DriveCard from './DriveCard'
import StatsPackage from './StatsPackage'
import { teamColor } from './teamColors'

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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const ROSTER = [
  { first: 'Josh', last: 'Allen', number: 17, position: 'QB' as const },
  { first: 'James', last: 'Cook', number: 4, position: 'RB' as const },
  { first: 'Dalton', last: 'Kincaid', number: 86, position: 'TE' as const },
  { first: 'Zach', last: 'Sieler', number: Number.NaN, position: 'DL' as const },
]
const player = (_team: 0 | 1, index: number) => ROSTER[index] ?? null

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
    down: 1,
    yardsToGo: 10,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      {
        id: 0,
        abbr: 'BUF',
        name: 'BUF',
        score: 7,
        timeouts: 3,
        players: [
          { rosterIndex: 0, pass: { att: 9, comp: 6, yds: 88, td: 0, int: 0 } },
          { rosterIndex: 1, rush: { att: 12, yds: 102, td: 1 } },
        ],
      },
      { id: 1, abbr: 'MIA', name: 'MIA', score: 0, timeouts: 3, players: [{ rosterIndex: 3, def: { sacks: 2, int: 0 } }] },
    ],
    playSelect: true,
    betweenPlays: false,
    carrier: null,
    carrierRoster: null,
    caught: false,
    touchback: false,
    outOfBounds: false,
    fumbled: false,
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

const play = (index: number, overrides: Partial<PlayResult> = {}): PlayResult => ({
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
  summary: 'RUSH',
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

const drive = (overrides: Partial<Drive> = {}): Drive => ({
  offense: 0,
  plays: 3,
  yards: 75,
  startClock: '9:00',
  result: 'TD',
  startSpot: { yard: 25, side: 0 },
  endSpot: { yard: 0, side: 1 },
  endSummary: 'EXTRA POINT GOOD',
  endTime: '2:41',
  ...overrides,
})

function trackerWith(plays: PlayResult[], drives: Drive[]): PlayTracker {
  const tracker = new PlayTracker({ recordRoutes: false })
  vi.spyOn(tracker, 'plays').mockReturnValue(plays)
  vi.spyOn(tracker, 'latestPlay').mockReturnValue(plays[plays.length - 1] ?? null)
  vi.spyOn(tracker, 'drives').mockReturnValue(drives)
  vi.spyOn(tracker, 'lastDrive').mockReturnValue(drives.filter((d) => d.result !== 'IN_PROGRESS').pop() ?? null)
  return tracker
}

const touchdownDrive = () => {
  const plays = [
    play(0, { yards: 30, people: { rusher: 1 } }),
    play(1, { yards: 38, startBallOn: { yard: 45, side: 1 }, thrown: true, people: { passer: 0, receiver: 2 } }),
    play(2, { yards: 7, startBallOn: { yard: 7, side: 1 }, touchdown: true, scoreAfter: [6, 0], people: { rusher: 1 } }),
    play(3, { isTry: true, kind: 'extraPoint', kicked: true, summary: 'EXTRA POINT GOOD', scoreBefore: [6, 0], scoreAfter: [7, 0] }),
  ]
  return { plays, drives: [drive({ plays: 4 })] }
}

test('the drive card shows plays, yards and time of possession under the field', () => {
  const { plays, drives } = touchdownDrive()
  render(<StatsPackage state={makeState()} tracker={trackerWith(plays, drives)} player={player} />)
  const card = screen.getByTestId('drive-card')
  expect(within(card).getByTestId('drive-card-head')).toHaveTextContent(/^BUF DRIVE\s*TOUCHDOWN$/)
  expect(within(card).getByTestId('drive-card-figures')).toHaveTextContent(/^4PLAYS\s*75YARDS\s*2:41TOP$/)
  expect(card).not.toHaveTextContent('START')
  expect(card).not.toHaveTextContent('END')

  const punt = [play(0, { yards: 12 }), play(1, { kind: 'punt', kicked: true, summary: 'PUNT' })]
  cleanup()
  render(
    <StatsPackage
      state={makeState()}
      tracker={trackerWith(punt, [drive({ plays: 1, yards: 12, result: 'PUNT', endSpot: { yard: 37, side: 0 }, endSummary: 'PUNT' })])}
     
      player={player}
    />,
  )
  expect(screen.getByTestId('drive-card-head')).toHaveTextContent(/^BUF DRIVE\s*PUNT$/)
  expect(screen.getByTestId('drive-card-figures')).toHaveTextContent(/^1PLAY\s*12YARDS\s*2:41TOP$/)

  cleanup()
  const safety = [play(0, { yards: -3, scoreAfter: [0, 2] })]
  render(<StatsPackage state={makeState()} tracker={trackerWith(safety, [drive({ plays: 1, yards: -3, result: 'DOWNS' })])} player={player} />)
  expect(screen.getByTestId('drive-card-head')).toHaveTextContent(/^BUF DRIVE\s*SAFETY$/)
})

test('the drive card marks start and end on the mini field', () => {
  const colors: [ReturnType<typeof teamColor>, ReturnType<typeof teamColor>] = [teamColor('BUF'), teamColor('MIA')]
  render(<DriveCard drive={drive({ offense: 1, startSpot: { yard: 20, side: 1 }, endSpot: { yard: 45, side: 1 } })} abbrs={['BUF', 'MIA']} colors={colors} />)
  const zones = screen.getAllByTestId('drive-card-zone')
  expect(zones.map((z) => z.textContent)).toEqual(['MIA', 'BUF'])
  expect(zones[0]).toHaveStyle({ backgroundColor: colors[1].primary })
  expect(zones[1]).toHaveStyle({ backgroundColor: colors[0].primary })
  expect(screen.getAllByTestId('drive-card-yard').map((y) => y.textContent)).toEqual(['10', '20', '30', '40', '50', '40', '30', '20', '10'])
  expect(screen.getByTestId('drive-card-tick').style.left).toBe(`${(30 / 120) * 100}%`)
  const arrow = screen.getByTestId('drive-card-arrow')
  expect(arrow.style.left).toBe(`${(30 / 120) * 100}%`)
  expect(arrow.style.width).toBe(`${(25 / 120) * 100}%`)
  expect(arrow).not.toHaveClass('drive-card-back')

  cleanup()
  render(<DriveCard drive={drive({ startSpot: { yard: 30, side: 0 }, endSpot: { yard: 22, side: 0 } })} abbrs={['BUF', 'MIA']} colors={colors} />)
  expect(screen.getByTestId('drive-card-arrow').style.left).toBe(`${(32 / 120) * 100}%`)
  expect(screen.getByTestId('drive-card-arrow')).toHaveClass('drive-card-back')
})

test('the player card shows number, name, line and headline', () => {
  const plays = [play(0, { yards: 90, people: { rusher: 1 } }), play(1, { yards: 12, people: { rusher: 1 } })]
  render(<StatsPackage state={makeState()} tracker={trackerWith(plays, [drive({ result: 'IN_PROGRESS' })])} player={player} />)
  expect(screen.queryByTestId('current-drive')).toBeNull()
  const card = screen.getByTestId('player-card')
  const block = within(card).getByTestId('player-card-block')
  expect(block).toHaveTextContent(/^4\s*RB$/)
  expect(block).toHaveStyle({ backgroundColor: teamColor('BUF').primary })
  expect(within(card).getByTestId('player-card-name')).toHaveTextContent(/^JAMES COOK$/)
  expect(within(card).getByTestId('player-card-line')).toHaveTextContent(/^12CAR\s*102YDS\s*1TD\s*90LONG$/)
  expect(within(card).getByTestId('player-card-headline')).toHaveTextContent(/^FIRST 100 YARD RUSHER OF THE GAME$/)

  cleanup()
  const sacks = [0, 1].map((i) => play(i, { sack: true, yards: -6, people: { defender: { team: 1, rosterIndex: 3, kind: 'sack' } } }))
  render(<StatsPackage state={makeState()} tracker={trackerWith(sacks, [drive({ result: 'IN_PROGRESS' })])} player={player} />)
  expect(screen.getByTestId('player-card-block')).toHaveTextContent(/^DL$/)
  expect(screen.getByTestId('player-card-block')).toHaveStyle({ backgroundColor: teamColor('MIA').primary })
  expect(screen.getByTestId('player-card-name')).toHaveTextContent(/^ZACH SIELER$/)
  expect(screen.getByTestId('player-card-line')).toHaveTextContent(/^2SK\s*0INT$/)
  expect(screen.getByTestId('player-card-headline')).toHaveTextContent('2ND SACK OF THE GAME')
})

test('the drive card wins over the player card when a drive just ended', () => {
  const plays = [play(0, { yards: 90, people: { rusher: 1 } }), play(1, { yards: 12, people: { rusher: 1 } })]
  const drives = [drive({ plays: 2, yards: 102, result: 'PUNT' })]
  render(<StatsPackage state={makeState()} tracker={trackerWith(plays, drives)} player={player} />)
  expect(screen.getByTestId('drive-card')).toBeInTheDocument()
  expect(screen.queryByTestId('player-card')).toBeNull()
  expect(screen.queryByTestId('current-drive')).toBeNull()

  cleanup()
  render(<StatsPackage state={makeState()} tracker={trackerWith(plays, [...drives, drive({ result: 'IN_PROGRESS', plays: 1 })])} player={player} />)
  expect(screen.queryByTestId('drive-card')).toBeNull()
  expect(screen.getByTestId('player-card')).toBeInTheDocument()

  cleanup()
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0)], [drive({ result: 'IN_PROGRESS', plays: 1 })])} player={player} />)
  expect(screen.queryByTestId('drive-card')).toBeNull()
  expect(screen.queryByTestId('player-card')).toBeNull()
  expect(screen.getByTestId('current-drive')).toHaveTextContent('1 PLAY ')
})

test('the cards take the current drive slot with readable text', () => {
  const { plays, drives } = touchdownDrive()
  render(<StatsPackage state={makeState()} tracker={trackerWith(plays, drives)} player={player} />)
  expect(screen.getByTestId('drive-card')).toHaveClass('pkg-panel', 'pkg-drive')
  cleanup()
  render(<StatsPackage state={makeState()} tracker={trackerWith([play(0, { yards: 90, people: { rusher: 1 } }), play(1, { yards: 12, people: { rusher: 1 } })], [])} player={player} />)
  expect(screen.getByTestId('player-card')).toHaveClass('pkg-panel', 'pkg-drive')
  for (const selector of ['.drive-card-figures', '.player-card-name', '.player-card-line', '.player-card-headline']) {
    expect(parseFloat(rule(selector)?.['font-size'] ?? '0')).toBeGreaterThanOrEqual(2.6)
  }
})
