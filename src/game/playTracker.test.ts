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
  call: null,
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

test('each ball point records the track row it was sampled on', () => {
  const t = new PlayTracker({ recordRoutes: true })
  t.push(state({ live: true }))
  t.push(state({ live: true, carrier: 2, positions: positions(1) }))
  t.push(state({ live: true, carrier: 2, positions: positions(1) }))
  t.push(state({ playOver: true }))
  t.push(state({}))
  const play = t.plays()[0]
  expect(play.tracks.frames).toHaveLength(3)
  expect(play.ball).toEqual([
    { x: 3, y: 4, slot: 2, sample: 1 },
    { x: 3, y: 4, slot: 2, sample: 2 },
  ])
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

test('a fumble out of bounds after a long run still counts the yards from the ball path', () => {
  const names = (tm: 0 | 1, i: number) => (tm === 1 && i === 2 ? 'ACHANE' : `N${tm}${i}`)
  const t = new PlayTracker({ recordRoutes: true, names })
  const field = { losX: 2243, toGainX: 2163, attacksHigh: false }
  const at = (slot: number, x: number) => positions(0).map((p, i) => (i === slot ? { x, y: 43 } : p))
  const base = { offense: 1 as const, possession: 1 as const, field }
  t.push(state({ ...base, live: true, carrier: 11, carrierRoster: 0, positions: at(11, 2261) }))
  t.push(state({ ...base, live: true, carrier: 12, carrierRoster: 2, positions: at(12, 2294) }))
  t.push(state({ ...base, live: true, carrier: 12, carrierRoster: 2, fumbled: true, positions: at(12, 1753) }))
  t.push(state({ ...base, playOver: true, carrier: 12, carrierRoster: 2, fumbled: true, positions: at(12, 1753) }))
  t.push(state({ ...base, playOver: true, carrier: 12, carrierRoster: 2, fumbled: true, positions: at(12, 1753) }))
  t.push(state({ ...base, carrier: 11, carrierRoster: 0 }))
  const [play] = t.plays()
  expect(play).toMatchObject({ offense: 1, yards: 61, summary: 'ACHANE RUSH, 61 YDS, FUMBLE', people: { rusher: 2 } })
  expect(t.drives()[0]).toMatchObject({ plays: 1, yards: 61 })
  expect(t.longest(1, 'rush')).toBe(61)
  expect(t.moments().map((m) => m.kind)).toEqual(['BIG_PLAY'])
})

const view = (t: PlayTracker) =>({ plays: t.plays(), drives: t.drives(), moments: t.moments(), top: t.timeOfPossession(), longest: [t.longest(0, 'rush'), t.longest(0, 'rec')], latest: t.latestPlay(), last: t.lastDrive() })

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

const throwAndCatch = (t: PlayTracker, o: { field: GameState['field']; offense: 0 | 1; qb: { x: number; y: number }; air: { x: number; y: number }; end: { x: number; y: number }; yards: number }) => {
  const qbSlot = o.offense * 11
  const wrSlot = qbSlot + 3
  const at = (slot: number, p: { x: number; y: number }) => positions(0).map((q, i) => (i === slot ? p : q))
  const before: [TeamState, TeamState] = [team('BUF'), team('CLE')]
  before[o.offense] = team(o.offense === 0 ? 'BUF' : 'CLE', [passer(0, 0), receiver(0, 0)])
  const after: [TeamState, TeamState] = [team('BUF'), team('CLE')]
  after[o.offense] = team(o.offense === 0 ? 'BUF' : 'CLE', [passer(1, 1), receiver(o.yards)])
  const base = { offense: o.offense, possession: o.offense, field: o.field, teams: before }
  t.push(state({ ...base, live: true, carrier: qbSlot, positions: at(qbSlot, o.qb) }))
  t.push(state({ ...base, live: true, thrown: true, ballInAir: o.qb }))
  t.push(state({ ...base, live: true, thrown: true, ballInAir: o.air }))
  t.push(state({ ...base, live: true, thrown: true, carrier: wrSlot, carrierRoster: 5, positions: at(wrSlot, o.air) }))
  t.push(state({ ...base, live: true, thrown: true, carrier: wrSlot, carrierRoster: 5, positions: at(wrSlot, o.end) }))
  t.push(state({ ...base, playOver: true, thrown: true, carrier: wrSlot }))
  t.push(state({ ...base, playOver: true, thrown: true, carrier: wrSlot, teams: after }))
  return t.plays()[t.plays().length - 1]
}

test('a completed pass splits into air yards and yards after catch', () => {
  const high = throwAndCatch(new PlayTracker({ recordRoutes: true }), {
    field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
    offense: 0,
    qb: { x: 0x800 - 40, y: 100 },
    air: { x: 0x800 + 115, y: 60 },
    end: { x: 0x800 + 176, y: 60 },
    yards: 22,
  })
  expect(high.pass?.outcome).toBe('caught')
  expect(high).toMatchObject({ yards: 22, airYards: 14, yac: 8 })
  const low = throwAndCatch(new PlayTracker({ recordRoutes: true }), {
    field: { losX: 0x800, toGainX: 0x7b0, attacksHigh: false },
    offense: 1,
    qb: { x: 0x800 + 40, y: 100 },
    air: { x: 0x800 - 52, y: 60 },
    end: { x: 0x800 - 50, y: 60 },
    yards: 7,
  })
  expect(low).toMatchObject({ yards: 7, airYards: 7, yac: 0 })
  const t = new PlayTracker({ recordRoutes: false })
  run(t, { teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }, { teams: [team('BUF', [rusher(7)]), team('CLE')] })
  expect(t.plays()[0]).toMatchObject({ airYards: null, yac: null })
})

test('a pass that ends in a defender hands is intercepted even before the stats land', () => {
  const t = new PlayTracker({ recordRoutes: true })
  const at = (slot: number, p: { x: number; y: number }) => positions(0).map((q, i) => (i === slot ? p : q))
  t.push(state({ live: true, carrier: 0, positions: at(0, { x: 0x7e0, y: 100 }) }))
  t.push(state({ live: true, thrown: true, ballInAir: { x: 0x7e0, y: 100 } }))
  t.push(state({ live: true, thrown: true, ballInAir: { x: 0x860, y: 60 } }))
  t.push(state({ live: true, thrown: true, carrier: 18, carrierRoster: 9, positions: at(18, { x: 0x860, y: 60 }) }))
  t.push(state({ playOver: true, thrown: true, carrier: 18 }))
  expect(t.latestPlay()?.pass?.outcome).toBe('intercepted')
  expect(t.latestPlay()).toMatchObject({ airYards: null, yac: null })
})

const qbRush = (yds: number, att = 1, td = 0): PlayerStats => ({ rosterIndex: 1, rush: { att, yds, td } })

test('a QB run on a pass play reads SCRAMBLE', () => {
  const t = new PlayTracker({ recordRoutes: false, names: (_tm, i) => (i === 1 ? 'ALLEN' : '') })
  const snap = { call: 'pass' as const, carrier: 0, carrierRoster: 1 }
  run(t, { ...snap, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { teams: [team('BUF', [qbRush(12)]), team('CLE')] })
  expect(t.plays()[0]).toMatchObject({ call: 'pass', scramble: true, thrown: false, yards: 12, summary: 'ALLEN SCRAMBLE, 12 YDS', people: { rusher: 1 } })
  expect(t.longest(0, 'rush')).toBe(12)
})

test('a designed run by the QB is still a rush', () => {
  const t = new PlayTracker({ recordRoutes: false, names: (_tm, i) => (i === 1 ? 'ALLEN' : '') })
  const snap = { call: 'run' as const, carrier: 0, carrierRoster: 1 }
  run(t, { ...snap, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { teams: [team('BUF', [qbRush(6)]), team('CLE')] })
  expect(t.plays()[0]).toMatchObject({ call: 'run', scramble: false, summary: 'ALLEN RUSH, 6 YDS' })
})

test('a handoff on a pass play and a QB run of unknown call are not scrambles', () => {
  const names = (_tm: 0 | 1, i: number) => (i === 1 ? 'ALLEN' : i === 3 ? 'COOK' : '')
  const handoff = new PlayTracker({ recordRoutes: false, names })
  run(handoff, { call: 'pass', carrier: 0, carrierRoster: 1, teams: [team('BUF', [rusher(0, 0)]), team('CLE')] }, { teams: [team('BUF', [rusher(5)]), team('CLE')] })
  expect(handoff.plays()[0]).toMatchObject({ scramble: false, summary: 'COOK RUSH, 5 YDS' })
  const unknown = new PlayTracker({ recordRoutes: false, names })
  run(unknown, { call: null, carrier: 0, carrierRoster: 1, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { teams: [team('BUF', [qbRush(5)]), team('CLE')] })
  expect(unknown.plays()[0]).toMatchObject({ call: null, scramble: false, summary: 'ALLEN RUSH, 5 YDS' })
})

test('a touchdown scramble ends with TOUCHDOWN', () => {
  const t = new PlayTracker({ recordRoutes: false, names: (_tm, i) => (i === 1 ? 'ALLEN' : '') })
  run(t, { call: 'pass', carrier: 0, carrierRoster: 1, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { touchdown: true, teams: [team('BUF', [qbRush(12, 1, 1)], 6), team('CLE')] })
  expect(t.plays()[0]).toMatchObject({ scramble: true, summary: 'ALLEN SCRAMBLE, 12 YDS, TOUCHDOWN' })
})

test('a QB tackled behind the line on a pass call is a sack', () => {
  const t = new PlayTracker({ recordRoutes: false, names: (_tm, i) => (i === 1 ? 'ALLEN' : '') })
  const sacker = (sacks: number): PlayerStats => ({ rosterIndex: 18, def: { sacks, int: 0 } })
  run(
    t,
    { call: 'pass', carrier: 0, carrierRoster: 1, teams: [team('BUF', [qbRush(0, 0)]), team('CLE', [sacker(0)])] },
    { teams: [team('BUF', [qbRush(-3)]), team('CLE', [sacker(1)])] },
  )
  expect(t.plays()[0]).toMatchObject({
    call: 'pass',
    sack: true,
    scramble: false,
    thrown: false,
    yards: -3,
    summary: 'SACK, -3 YDS',
    people: { defender: { team: 1, rosterIndex: 18, kind: 'sack' } },
  })
  const bare = new PlayTracker({ recordRoutes: false })
  run(bare, { call: 'pass', carrier: 0, carrierRoster: 1, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { teams: [team('BUF', [qbRush(-3)]), team('CLE')] })
  expect(bare.plays()[0]).toMatchObject({ sack: true, scramble: false, yards: -3 })
  expect(bare.moments().map((m) => m.kind)).toContain('SACK')
})

test('a QB who crosses the line on a pass call is still a scramble', () => {
  const t = new PlayTracker({ recordRoutes: false, names: (_tm, i) => (i === 1 ? 'ALLEN' : '') })
  run(t, { call: 'pass', carrier: 0, carrierRoster: 1, teams: [team('BUF', [qbRush(0, 0)]), team('CLE')] }, { teams: [team('BUF', [qbRush(2)]), team('CLE')] })
  expect(t.plays()[0]).toMatchObject({ sack: false, scramble: true, yards: 2 })
})

const squad = (team: 0 | 1, unit: 'offense' | 'defense') => Array.from({ length: 11 }, (_, i) => ({ entry: i + (unit === 'defense' ? 11 : 0), role: unit, rosterIndex: team * 30 + i }))

const lineupsOf = (events: ReturnType<PlayTracker['push']>, seen?: PlayTracker) =>
  events.flatMap((e) => {
    if (e.type !== 'lineup') return []
    seen?.lineupSeen(e.lineup)
    return [`${e.lineup.team}:${e.lineup.unit}`]
  })

const selectThenPlay = (t: PlayTracker, o: Partial<GameState>) => [...t.push(state({ ...o, playSelect: true })), ...t.push(state({ ...o, playSelect: true })), ...run(t, o, o)]

test('each of the four lineups shows once per game, including across a save load', () => {
  const t = new PlayTracker({ recordRoutes: false, lineup: squad })
  const shown: string[] = []
  shown.push(...lineupsOf(run(t, { playKind: 'kickoff', kicked: true }, {}), t))
  shown.push(...lineupsOf(selectThenPlay(t, { offense: 0 }), t))
  shown.push(...lineupsOf(selectThenPlay(t, { offense: 0 }), t))
  shown.push(...lineupsOf(selectThenPlay(t, { offense: 0 }), t))
  shown.push(...lineupsOf(selectThenPlay(t, { offense: 0, isTry: true }), t))
  shown.push(...lineupsOf(t.push(state({ offense: 1, playSelect: true })), t))
  expect(shown).toEqual(['0:offense', '1:defense', '1:offense'])
  const loaded = new PlayTracker({ recordRoutes: false, lineup: squad })
  loaded.restore(JSON.parse(JSON.stringify(t.sidecar())))
  shown.push(...lineupsOf(selectThenPlay(loaded, { offense: 1 }), loaded))
  shown.push(...lineupsOf(selectThenPlay(loaded, { offense: 1 }), loaded))
  shown.push(...lineupsOf(selectThenPlay(loaded, { offense: 0 }), loaded))
  shown.push(...lineupsOf(selectThenPlay(loaded, { offense: 1 }), loaded))
  expect(shown).toEqual(['0:offense', '1:defense', '1:offense', '0:defense'])
  const lineup = new PlayTracker({ recordRoutes: false, lineup: squad }).push(state({ offense: 1, playSelect: true }))
  expect(lineup).toEqual([{ type: 'lineup', lineup: { team: 1, unit: 'offense', players: squad(1, 'offense') } }])
  expect(lineupsOf(selectThenPlay(new PlayTracker({ recordRoutes: false }), { offense: 0 }))).toEqual([])
})

test('a lineup the snap cuts off before it is seen stays due for the next play select', () => {
  const t = new PlayTracker({ recordRoutes: false, lineup: squad })
  expect(lineupsOf(selectThenPlay(t, { offense: 0 }))).toEqual(['0:offense'])
  expect(lineupsOf(selectThenPlay(t, { offense: 0 }), t)).toEqual(['0:offense'])
  expect(lineupsOf(selectThenPlay(t, { offense: 0 }), t)).toEqual(['1:defense'])
  expect(t.sidecar().lineupsShown).toEqual(['offense0', 'defense1'])
})

test('a new game after the menus shows the lineups again', () => {
  const t = new PlayTracker({ recordRoutes: false, lineup: squad })
  lineupsOf(selectThenPlay(t, { offense: 0 }), t)
  lineupsOf(selectThenPlay(t, { offense: 0 }), t)
  expect(lineupsOf(selectThenPlay(t, { offense: 0 }), t)).toEqual([])
  t.push(state({ inGame: false, quarter: 0 }))
  t.push(state({ inGame: false, inBreak: true, quarter: 1 }))
  t.push(state({ quarter: 1 }))
  expect(lineupsOf(selectThenPlay(t, { offense: 0, quarter: 1 }), t)).toEqual([])
  t.push(state({ inGame: false }))
  t.push(state({ playKind: 'kickoff' }))
  expect(lineupsOf(selectThenPlay(t, { offense: 0 }), t)).toEqual(['0:offense'])
})

test('a new game after the menus starts the tracker over', () => {
  const t = new PlayTracker({ recordRoutes: false })
  t.push(state({ clock: { min: 10, sec: 0 } }))
  run(t, { offense: 0, clock: { min: 9, sec: 50 } }, { teams: [team('BUF', [rusher(25)]), team('CLE')], clock: { min: 9, sec: 40 } })
  run(t, { offense: 0, clock: { min: 9, sec: 30 } }, { teams: [team('BUF', [rusher(32, 2)]), team('CLE')], clock: { min: 9, sec: 20 } })
  t.push(state({ inGame: false, inBreak: true, quarter: 1 }))
  t.push(state({ playKind: 'kickoff', quarter: 0 }))
  expect(t.plays()).toHaveLength(2)
  expect(t.drives()).toHaveLength(1)
  t.push(state({ inGame: false }))
  t.push(state({ playKind: 'kickoff', clock: { min: 5, sec: 0 } }))
  expect(t.plays()).toEqual([])
  expect(t.drives()).toEqual([])
  expect(t.moments()).toEqual([])
  expect(t.timeOfPossession()).toEqual([0, 0])
  expect(t.longest(0, 'rush')).toBe(0)
  expect(t.latestPlay()).toBeNull()
  run(t, { offense: 1, clock: { min: 4, sec: 50 } }, { offense: 1, teams: [team('BUF'), team('CLE', [rusher(4)])], clock: { min: 4, sec: 40 } })
  expect(t.plays().map((p) => p.index)).toEqual([0])
  expect(t.timeOfPossession()).toEqual([0, 20])
})
