import { expect, test } from 'vitest'
import type { Drive, PlayResult } from './playTracker'
import { teamComparison } from './teamStats'
import type { GameState, PlayerStats, TeamState } from './types'

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 0,
  offense: 0,
  quarter: 0,
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
  summary: '',
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
  plays: 1,
  yards: 5,
  startClock: '10:00',
  result: 'PUNT',
  startSpot: { yard: 25, side: 0 },
  endSpot: { yard: 30, side: 0 },
  endSummary: '',
  endTime: '0:30',
  ...overrides,
})

const team = (players: PlayerStats[]): TeamState => ({ id: 0, abbr: 'AAA', name: 'AAA', score: 0, timeouts: 3, players })
const state = (a: PlayerStats[], b: PlayerStats[]) => ({ teams: [team(a), team(b)] }) as GameState

const row = (c: ReturnType<typeof teamComparison>, label: string) => c.find((r) => r.label === label)

test('rows come in the specified order', () => {
  const c = teamComparison([], [], state([], []), [0, 0])
  expect(c.map((r) => r.label)).toEqual(['TOTAL YDS', 'RUSH YDS', 'PASS YDS', '3RD DOWN', 'RED ZONE', 'TURNOVERS', 'POSSESSION'])
})

test('yardage rows come from the stats and the higher side leads', () => {
  const a = [{ rosterIndex: 3, rush: { att: 5, yds: 40, td: 0 } }, { rosterIndex: 5, rec: { rec: 3, yds: 60, td: 0 } }]
  const b = [{ rosterIndex: 3, rush: { att: 5, yds: 70, td: 0 } }, { rosterIndex: 5, rec: { rec: 3, yds: 60, td: 0 } }]
  const c = teamComparison([], [], state(a, b), [0, 0])
  expect(row(c, 'TOTAL YDS')).toEqual({ label: 'TOTAL YDS', values: ['100', '130'], leader: 1 })
  expect(row(c, 'RUSH YDS')).toMatchObject({ values: ['40', '70'], leader: 1 })
  expect(row(c, 'PASS YDS')).toMatchObject({ values: ['60', '60'], leader: null })
})

test('third downs count conversions by yards or touchdown', () => {
  const plays = [
    play({ down: 3, toGo: 5, yards: 6 }),
    play({ down: 3, toGo: 5, yards: 2 }),
    play({ down: 3, toGo: 8, yards: 3, touchdown: true }),
    play({ down: 3, toGo: 4, yards: 9, offense: 1 }),
    play({ down: 2, toGo: 4, yards: 9 }),
  ]
  const c = teamComparison(plays, [], state([], []), [0, 0])
  expect(row(c, '3RD DOWN')).toEqual({ label: '3RD DOWN', values: ['2 OF 3', '1 OF 1'], leader: 0 })
})

test('red zone counts drives with a play inside the opponent 20 and converts on touchdown', () => {
  const plays = [
    play({ startBallOn: { yard: 15, side: 1 } }),
    play({ startBallOn: { yard: 5, side: 1 }, touchdown: true }),
    play({ offense: 1, startBallOn: { yard: 10, side: 0 } }),
    play({ startBallOn: { yard: 30, side: 0 } }),
    play({ offense: 1, startBallOn: { yard: 25, side: 0 } }),
    play({ offense: 1, startBallOn: { yard: 15, side: 0 } }),
  ]
  const drives = [
    drive({ plays: 2, result: 'TD' }),
    drive({ offense: 1, plays: 1, result: 'PUNT' }),
    drive({ offense: 0, plays: 1, result: 'PUNT' }),
    drive({ offense: 1, plays: 2, result: 'FG' }),
  ]
  const c = teamComparison(plays, drives, state([], []), [0, 0])
  expect(row(c, 'RED ZONE')?.values).toEqual(['1 OF 1', '0 OF 2'])
})

test('turnovers favor the lower side and possession formats minutes and seconds', () => {
  const plays = [play({ interception: true }), play({ summary: 'FUMBLE LOST' }), play({ offense: 1, summary: 'FUMBLE LOST' })]
  const c = teamComparison(plays, [], state([], []), [125, 61])
  expect(row(c, 'TURNOVERS')).toEqual({ label: 'TURNOVERS', values: ['2', '1'], leader: 1 })
  expect(row(c, 'POSSESSION')).toEqual({ label: 'POSSESSION', values: ['2:05', '1:01'], leader: 0 })
})
