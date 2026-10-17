import { expect, test } from 'vitest'
import { PlayTracker } from './playTracker'
import type { GameState, PlayerStats, TeamState } from './types'

const team = (abbr: string, players: PlayerStats[] = [], score = 0): TeamState => ({ id: 0, abbr, name: abbr, score, timeouts: 3, players })

const positions = (offset: number) => Array.from({ length: 22 }, (_, i) => ({ x: i + offset, y: i * 2 }))

const state = (o: Partial<GameState> = {}): GameState => ({
  inGame: true,
  live: false,
  playOver: false,
  touchdown: false,
  sack: false,
  kicked: false,
  quarter: 0,
  clock: { min: 10, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 25, side: 0 },
  offense: 0,
  teams: [team('BUF'), team('CLE')],
  positions: positions(0),
  frame: 0,
  ...o,
})

const rusher = (yds: number, att = 1): PlayerStats => ({ rosterIndex: 3, rush: { att, yds, td: 0 } })
const receiver = (yds: number, rec = 1): PlayerStats => ({ rosterIndex: 5, rec: { rec, yds, td: 0 } })
const passer = (att: number, comp: number): PlayerStats => ({ rosterIndex: 1, pass: { att, comp, yds: 0, td: 0, int: 0 } })
const defender = (int: number): PlayerStats => ({ rosterIndex: 9, def: { sacks: 0, int } })

const run = (t: PlayTracker, start: Partial<GameState>, end: Partial<GameState>) => {
  const events = [...t.push(state({ ...start, live: true })), ...t.push(state({ ...end, playOver: true }))]
  return events
}

test('snap then over yields one playEnd with rushing delta', () => {
  const t = new PlayTracker({ recordRoutes: true })
  const snap = t.push(state({ live: true, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }))
  expect(snap).toEqual([{ type: 'snap' }])
  const end = t.push(state({ playOver: true, teams: [team('BUF', [rusher(7)]), team('CLE')] }))
  expect(end).toHaveLength(1)
  expect(end[0].type).toBe('playEnd')
  expect(t.plays()).toHaveLength(1)
  expect(t.plays()[0].yards).toBe(7)
  expect(t.plays()[0].summary).toBe('RUSH, 7 YDS')
})

test('summary uses names for pass and rush', () => {
  const names = (tm: 0 | 1, i: number) => `N${tm}${i}`
  const t = new PlayTracker({ recordRoutes: false, names })
  run(
    t,
    { teams: [team('BUF', [passer(0, 0), receiver(0, 0)]), team('CLE')] },
    { teams: [team('BUF', [passer(1, 1), receiver(22)]), team('CLE')] },
  )
  expect(t.plays()[0].summary).toBe('N01 PASS TO N05, 22 YDS')
})

test('45 yard receiving touchdown is a LONG_TD', () => {
  const t = new PlayTracker({ recordRoutes: false })
  const events = run(
    t,
    { teams: [team('BUF', [receiver(0, 0)]), team('CLE')] },
    { touchdown: true, teams: [team('BUF', [receiver(45)], 6), team('CLE')] },
  )
  const moment = events.find((e) => e.type === 'bigMoment')
  expect(moment && moment.type === 'bigMoment' && moment.moment.kind).toBe('LONG_TD')
  expect(t.plays()[0].touchdown).toBe(true)
  expect(t.moments()).toHaveLength(1)
})

test('30 yard non-TD gain is a BIG_PLAY', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [receiver(0, 0)]), team('CLE')] }, { teams: [team('BUF', [receiver(30)]), team('CLE')] })
  expect(t.moments().map((m) => m.kind)).toEqual(['BIG_PLAY'])
})

test('sack yardage comes from ballOn and yields SACK', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { ballOn: { yard: 30, side: 0 } }, { sack: true, ballOn: { yard: 22, side: 0 } })
  expect(t.plays()[0].sack).toBe(true)
  expect(t.plays()[0].yards).toBe(-8)
  expect(t.plays()[0].summary).toBe('SACK, -8 YDS')
  expect(t.moments().map((m) => m.kind)).toEqual(['SACK'])
})

test('sack yardage is negated for offense 1', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { offense: 1, ballOn: { yard: 30, side: 1 } }, { offense: 1, sack: true, ballOn: { yard: 22, side: 1 } })
  expect(t.plays()[0].yards).toBe(-8)
})

test('defender int increment yields INT', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(
    t,
    { teams: [team('BUF'), team('CLE', [defender(0)])] },
    { teams: [team('BUF'), team('CLE', [defender(1)])] },
  )
  expect(t.plays()[0].interception).toBe(true)
  expect(t.plays()[0].summary).toBe('INTERCEPTED')
  expect(t.moments().map((m) => m.kind)).toEqual(['INT'])
})

test('routes record 11 offensive slots per live state', () => {
  const t = new PlayTracker({ recordRoutes: true })
  for (let i = 0; i < 5; i++) t.push(state({ live: true, offense: 1, positions: positions(i) }))
  t.push(state({ playOver: true, offense: 1, positions: positions(99) }))
  const routes = t.plays()[0].routes
  expect(routes).toHaveLength(11)
  expect(routes.every((r) => r.points.length === 5)).toBe(true)
  expect(routes[0].slot).toBe(0)
  expect(routes[0].points[0]).toEqual({ x: 11, y: 22 })
  expect(routes[10].points[4]).toEqual({ x: 25, y: 42 })
})

test('recordRoutes false leaves routes empty', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  expect(t.plays()[0].routes).toEqual([])
})

test('offense flip after a +7 play closes a TD drive', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)], 0), team('CLE')] }, { touchdown: true, teams: [team('BUF', [rusher(20)], 7), team('CLE')] })
  t.push(state({ offense: 1, teams: [team('BUF', [], 7), team('CLE')] }))
  expect(t.drives()).toHaveLength(1)
  expect(t.drives()[0]).toEqual({ offense: 0, plays: 1, yards: 20, startClock: '10:00', result: 'TD' })
})

test('offense flip with kicked closes a PUNT drive', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, { kicked: true })
  t.push(state({ offense: 1 }))
  expect(t.drives()[0].result).toBe('PUNT')
})

test('offense flip without kick or score is a TURNOVER and open drive is IN_PROGRESS', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  t.push(state({ offense: 1 }))
  expect(t.drives()[0].result).toBe('TURNOVER')
  run(t, { offense: 1 }, { offense: 1 })
  expect(t.drives()).toHaveLength(2)
  expect(t.drives()[1].result).toBe('IN_PROGRESS')
})

test('halftime closes a drive as END_OF_HALF', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { quarter: 1 }, { quarter: 1 })
  t.push(state({ quarter: 2 }))
  expect(t.drives()[0].result).toBe('END_OF_HALF')
})

test('states with inGame false produce no events', () => {
  const t = new PlayTracker({ recordRoutes: true })
  expect(t.push(state({ inGame: false, live: true }))).toEqual([])
  expect(t.push(state({ inGame: false, playOver: true }))).toEqual([])
  expect(t.plays()).toHaveLength(0)
  expect(t.drives()).toHaveLength(0)
})

test('time of possession accumulates clock decreases per offense', () => {
  const t = new PlayTracker({ recordRoutes: false })
  t.push(state({ clock: { min: 10, sec: 0 } }))
  t.push(state({ clock: { min: 9, sec: 30 } }))
  t.push(state({ clock: { min: 9, sec: 20 }, offense: 1 }))
  t.push(state({ clock: { min: 15, sec: 0 }, offense: 1, quarter: 1 }))
  t.push(state({ clock: { min: 14, sec: 50 }, offense: 1, quarter: 1 }))
  expect(t.timeOfPossession()).toEqual([30, 20])
})

test('longest tracks per team rush and rec', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }, { teams: [team('BUF', [rusher(12)]), team('CLE')] })
  run(t, { teams: [team('BUF', [rusher(12)]), team('CLE')] }, { teams: [team('BUF', [rusher(15)]), team('CLE')] })
  expect(t.longest(0, 'rush')).toBe(12)
  expect(t.longest(0, 'rec')).toBe(0)
  expect(t.longest(1, 'rush')).toBe(0)
})
