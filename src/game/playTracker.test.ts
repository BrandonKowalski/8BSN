import { expect, test } from 'vitest'
import { PlayTracker } from './playTracker'
import type { GameState, PlayerStats, TeamState } from './types'

const team = (abbr: string, players: PlayerStats[] = [], score = 0): TeamState => ({ id: 0, abbr, name: abbr, score, timeouts: 3, players })

const positions = (offset: number) => Array.from({ length: 22 }, (_, i) => ({ x: i + offset, y: i * 2 }))

const state = (o: Partial<GameState> = {}): GameState => ({
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
  quarter: 0,
  clock: { min: 10, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 25, side: 0 },
  offense: 0,
  possession: 0,
  teams: [team('BUF'), team('CLE')],
  playSelect: false,
  betweenPlays: false,
  carrier: null,
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  positions: positions(0),
  frame: 0,
  ...o,
})

const rusher = (yds: number, att = 1): PlayerStats => ({ rosterIndex: 3, rush: { att, yds, td: 0 } })
const receiver = (yds: number, rec = 1): PlayerStats => ({ rosterIndex: 5, rec: { rec, yds, td: 0 } })
const passer = (att: number, comp: number): PlayerStats => ({ rosterIndex: 1, pass: { att, comp, yds: 0, td: 0, int: 0 } })
const defender = (int: number): PlayerStats => ({ rosterIndex: 9, def: { sacks: 0, int } })

const run = (t: PlayTracker, start: Partial<GameState>, end: Partial<GameState>) => {
  const { teams: _endTeams, ...flags } = end
  return [
    ...t.push(state({ ...start, live: true })),
    ...t.push(state({ ...flags, ...start, playOver: true })),
    ...t.push(state({ ...end, playOver: true })),
    ...t.push(state({ ...end })),
  ]
}

test('snap then over yields one playEnd with rushing delta', () => {
  const t = new PlayTracker({ recordRoutes: true })
  const snap = t.push(state({ live: true, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }))
  expect(snap).toEqual([{ type: 'snap' }])
  expect(t.push(state({ playOver: true, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }))).toEqual([{ type: 'playOver' }])
  expect(t.push(state({ playOver: true, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }))).toEqual([])
  expect(t.plays()).toHaveLength(0)
  const end = t.push(state({ playOver: true, teams: [team('BUF', [rusher(7)]), team('CLE')] }))
  expect(end).toHaveLength(1)
  expect(end[0].type).toBe('playEnd')
  expect(t.plays()).toHaveLength(1)
  expect(t.plays()[0].yards).toBe(7)
  expect(t.plays()[0].summary).toBe('RUSH, 7 YDS')
})

test('reset leaves the tracker as if newly constructed', () => {
  const t = new PlayTracker({ recordRoutes: true })
  run(t, { live: true, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }, { teams: [team('BUF', [rusher(7)]), team('CLE')] })
  t.push(state({ live: true }))
  expect(t.plays()).toHaveLength(1)
  t.reset()
  expect(t.sidecar()).toEqual(new PlayTracker({ recordRoutes: true }).sidecar())
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
  t.push(state({ offense: 1, positions: positions(200) }))
  const routes = t.plays()[0].routes
  expect(routes).toHaveLength(11)
  expect(routes.every((r) => r.points.length === 5)).toBe(true)
  expect(routes[0].slot).toBe(0)
  expect(routes[0].points[0]).toEqual({ x: 11, y: 22 })
  expect(routes[10].points[4]).toEqual({ x: 25, y: 42 })
  const { tracks } = t.plays()[0]
  expect(tracks.frames).toHaveLength(5)
  expect(tracks.players.every((p) => p.length === 22)).toBe(true)
  expect(tracks.players[4][21]).toEqual({ x: 25, y: 42 })
})

test('recordRoutes false leaves routes and tracks empty', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  expect(t.plays()[0].routes).toEqual([])
  expect(t.plays()[0].tracks).toEqual({ frames: [], players: [] })
})

test('offense flip after a +7 play closes a TD drive', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)], 0), team('CLE')] }, { touchdown: true, teams: [team('BUF', [rusher(20)], 7), team('CLE')] })
  t.push(state({ offense: 1, teams: [team('BUF', [], 7), team('CLE')] }))
  expect(t.drives()).toHaveLength(1)
  expect(t.drives()[0]).toMatchObject({ offense: 0, plays: 1, yards: 20, startClock: '10:00', result: 'TD', startSpot: { yard: 25, side: 0 }, endSpot: { yard: 45, side: 0 } })
  expect(t.lastDrive()).toEqual(t.drives()[0])
})

test('offense flip with kicked closes a PUNT drive', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  run(t, { playKind: 'punt' }, {})
  t.push(state({ offense: 1 }))
  expect(t.drives()[0].result).toBe('PUNT')
})

test('offense flip without kick or score is DOWNS and open drive is IN_PROGRESS', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  t.push(state({ offense: 1 }))
  expect(t.drives()[0].result).toBe('DOWNS')
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

test('punt with offense flipped on the snap frame closes the kicking drive as PUNT', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  run(t, { offense: 1, playKind: 'punt' }, { offense: 1 })
  expect(t.drives()[0]).toMatchObject({ offense: 0, plays: 1, result: 'PUNT' })
  expect(t.drives()).toHaveLength(1)
  expect(t.plays()).toHaveLength(2)
})

test('halftime with possession flipped yields END_OF_HALF', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { quarter: 1 }, { quarter: 1 })
  t.push(state({ quarter: 2, offense: 1 }))
  expect(t.drives()[0].result).toBe('END_OF_HALF')
})

test('kickoff after a touchdown is not a play of the receiving drive', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)], 0), team('CLE')] }, { touchdown: true, teams: [team('BUF', [rusher(20)], 6), team('CLE')] })
  run(t, { offense: 1, playKind: 'kickoff', teams: [team('BUF', [], 6), team('CLE')] }, { offense: 1, kicked: true, teams: [team('BUF', [], 6), team('CLE')] })
  run(t, { offense: 1 }, { offense: 1 })
  expect(t.drives().map((d) => [d.offense, d.plays, d.result])).toEqual([
    [0, 1, 'TD'],
    [1, 1, 'IN_PROGRESS'],
  ])
})

test('sack from midfield measures from the 50', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { ballOn: { yard: 50, side: null } }, { sack: true, ballOn: { yard: 43, side: 0 } })
  expect(t.plays()[0].yards).toBe(-7)
  expect(t.plays()[0].summary).toBe('SACK, -7 YDS')
})

test('sack back to midfield for offense 1 measures to the 50', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { offense: 1, ballOn: { yard: 45, side: 0 } }, { offense: 1, sack: true, ballOn: { yard: 50, side: null } })
  expect(t.plays()[0].yards).toBe(-5)
})

test('a 39 yard touchdown is not a LONG_TD and not a BIG_PLAY', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(
    t,
    { teams: [team('BUF', [receiver(0, 0)]), team('CLE')] },
    { touchdown: true, teams: [team('BUF', [receiver(39)], 6), team('CLE')] },
  )
  expect(t.plays()[0].touchdown).toBe(true)
  expect(t.moments()).toEqual([])
})

test('the half ending while the last play is still closing yields END_OF_HALF', () => {
  const t = new PlayTracker({ recordRoutes: false })
  t.push(state({ quarter: 1, live: true, frame: 1 }))
  t.push(state({ quarter: 1, playOver: true, frame: 2 }))
  t.push(state({ quarter: 2, playOver: true, frame: 3 }))
  t.push(state({ quarter: 2, frame: 4 }))
  t.push(state({ quarter: 2, frame: 5 }))
  expect(t.plays()).toHaveLength(1)
  expect(t.drives()[0].result).toBe('END_OF_HALF')
})

test('a closing play is finalized after the frame cap even if nothing changes', () => {
  const t = new PlayTracker({ recordRoutes: false })
  t.push(state({ live: true, frame: 10 }))
  t.push(state({ playOver: true, frame: 11 }))
  t.push(state({ playOver: true, frame: 910 }))
  expect(t.plays()).toHaveLength(0)
  const events = t.push(state({ playOver: true, frame: 911 }))
  expect(events[0].type).toBe('playEnd')
})

test('sack and touchdown bits set after the closing edge are kept', () => {
  const t = new PlayTracker({ recordRoutes: false })
  t.push(state({ live: true, ballOn: { yard: 30, side: 0 } }))
  t.push(state({ playOver: true, ballOn: { yard: 30, side: 0 } }))
  t.push(state({ playOver: true, sack: true, ballOn: { yard: 30, side: 0 } }))
  t.push(state({ playOver: true, sack: true, ballOn: { yard: 24, side: 0 }, teams: [team('BUF'), team('CLE', [{ rosterIndex: 18, def: { sacks: 1, int: 0 } }])] }))
  expect(t.plays()[0]).toMatchObject({ sack: true, yards: -6 })
})

test('a missed field goal is not a PUNT', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, {})
  run(t, { playKind: 'fieldGoal' }, {})
  t.push(state({ offense: 1 }))
  expect(t.drives()[0].result).toBe('MISSED_FG')
  expect(t.plays()[1]).toMatchObject({ kicked: true, summary: 'FIELD GOAL NO GOOD' })
})

test('a made try reads PAT GOOD and does not count as a drive play', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)], 0), team('CLE')] }, { touchdown: true, teams: [team('BUF', [rusher(8)], 6), team('CLE')] })
  run(t, { isTry: true, teams: [team('BUF', [rusher(8)], 6), team('CLE')] }, { teams: [team('BUF', [rusher(10)], 7), team('CLE')] })
  t.push(state({ offense: 1, teams: [team('BUF', [], 7), team('CLE')] }))
  expect(t.plays()[1].summary).toBe('PAT GOOD')
  expect(t.drives()[0]).toMatchObject({ plays: 1, yards: 8, result: 'TD' })
})

test('a scrimmage play that ends with the defense holding the ball and no stats is a FUMBLE LOST', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, {}, { possession: 1 })
  expect(t.plays()[0].summary).toBe('FUMBLE LOST')
  t.push(state({ offense: 1, possession: 1 }))
  expect(t.lastDrive()?.result).toBe('FUMBLE')
  run(t, { offense: 1, possession: 1 }, { offense: 1, possession: 1 })
  expect(t.plays()[1].summary).toBe('PLAY, 0 YDS')
})

const view = (t: PlayTracker) => ({ plays: t.plays(), drives: t.drives(), moments: t.moments(), top: t.timeOfPossession(), longest: [t.longest(0, 'rush'), t.longest(0, 'rec')], latest: t.latestPlay(), last: t.lastDrive() })

test('a restored sidecar reproduces the compiled plays, drives and moments', () => {
  const t = new PlayTracker({ recordRoutes: true })
  run(
    t,
    { clock: { min: 10, sec: 0 }, teams: [team('BUF', [receiver(0, 0)]), team('CLE')] },
    { clock: { min: 9, sec: 40 }, touchdown: true, teams: [team('BUF', [receiver(45)], 6), team('CLE')] },
  )
  const copy = new PlayTracker({ recordRoutes: true })
  copy.restore(JSON.parse(JSON.stringify(t.sidecar())))
  expect(view(copy)).toEqual(view(t))
  expect(copy.moments()).toHaveLength(1)
})

test('a sidecar saved mid play finishes the play after restore', () => {
  const before = [team('BUF', [rusher(0, 0)]), team('CLE')] as [TeamState, TeamState]
  const after = [team('BUF', [rusher(12)]), team('CLE')] as [TeamState, TeamState]
  const t = new PlayTracker({ recordRoutes: true })
  t.push(state({ live: true, teams: before }))
  t.push(state({ live: true, teams: before, positions: positions(4) }))
  const copy = new PlayTracker({ recordRoutes: true })
  copy.restore(JSON.parse(JSON.stringify(t.sidecar())))
  for (const tracker of [t, copy]) {
    tracker.push(state({ playOver: true, teams: before }))
    tracker.push(state({ playOver: true, teams: after }))
  }
  expect(copy.plays()).toHaveLength(1)
  expect(view(copy)).toEqual(view(t))
})

test('a drive that turns the ball over on downs reads DOWNS', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(
    t,
    { clock: { min: 10, sec: 0 }, ballOn: { yard: 30, side: 0 }, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] },
    { clock: { min: 9, sec: 30 }, teams: [team('BUF', [rusher(4)]), team('CLE')] },
  )
  run(
    t,
    { clock: { min: 9, sec: 30 }, down: 4, yardsToGo: 6, ballOn: { yard: 34, side: 0 }, teams: [team('BUF', [rusher(4)]), team('CLE')] },
    { clock: { min: 9, sec: 0 }, teams: [team('BUF', [rusher(6, 2)]), team('CLE')] },
  )
  t.push(state({ offense: 1, clock: { min: 9, sec: 0 } }))
  expect(t.plays()[1]).toMatchObject({ down: 4, toGo: 6, startBallOn: { yard: 34, side: 0 }, people: { rusher: 3 } })
  expect(t.lastDrive()).toEqual({
    offense: 0,
    plays: 2,
    yards: 6,
    startClock: '10:00',
    result: 'DOWNS',
    startSpot: { yard: 30, side: 0 },
    endSpot: { yard: 36, side: 0 },
    endSummary: 'RUSH, 2 YDS',
    endTime: '1:00',
  })
})

test('drive time sums the clock across a quarter change', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { clock: { min: 0, sec: 20 } }, { clock: { min: 0, sec: 5 } })
  t.push(state({ quarter: 1, clock: { min: 15, sec: 0 } }))
  run(t, { quarter: 1, clock: { min: 15, sec: 0 } }, { quarter: 1, clock: { min: 14, sec: 40 } })
  t.push(state({ quarter: 1, offense: 1, clock: { min: 14, sec: 40 } }))
  expect(t.lastDrive()).toMatchObject({ plays: 2, startClock: '0:20', endTime: '0:35' })
})

test('a play records its start frame, closing frame and the scores around it', () => {
  const t = new PlayTracker({ recordRoutes: true })
  t.push(state({ live: true, frame: 40, down: 3, yardsToGo: 7, ballOn: { yard: 12, side: 1 }, teams: [team('BUF', [receiver(0, 0)], 3), team('CLE', [], 7)] }))
  t.push(state({ live: true, frame: 41, teams: [team('BUF', [receiver(0, 0)], 3), team('CLE', [], 7)] }))
  t.push(state({ playOver: true, frame: 42, teams: [team('BUF', [receiver(0, 0)], 3), team('CLE', [], 7)] }))
  t.push(state({ playOver: true, frame: 50, touchdown: true, teams: [team('BUF', [receiver(12)], 9), team('CLE', [], 7)] }))
  expect(t.plays()[0]).toMatchObject({
    startFrame: 40,
    endFrame: 42,
    down: 3,
    toGo: 7,
    startBallOn: { yard: 12, side: 1 },
    scoreBefore: [3, 7],
    scoreAfter: [9, 7],
    people: { receiver: 5 },
  })
  expect(t.plays()[0].tracks.frames).toEqual([40, 41])
})

test('a sack credits the defender', () => {
  const t = new PlayTracker({ recordRoutes: false })
  run(
    t,
    { ballOn: { yard: 30, side: 0 }, teams: [team('BUF'), team('CLE', [{ rosterIndex: 18, def: { sacks: 0, int: 0 } }])] },
    { sack: true, ballOn: { yard: 22, side: 0 }, teams: [team('BUF'), team('CLE', [{ rosterIndex: 18, def: { sacks: 1, int: 0 } }])] },
  )
  expect(t.plays()[0].people).toEqual({ defender: { team: 1, rosterIndex: 18, kind: 'sack' } })
})
