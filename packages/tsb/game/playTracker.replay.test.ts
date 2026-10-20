import { expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../tools/replayFixture'
import { decodeGameState } from './decode'
import { TSB2026_MAP } from './maps/tsb2026'
import { PlayTracker, type TrackerEvent } from './playTracker'
import { playHeadline } from './format'
import type { RosterPlayer, RosterTeam } from './roster'
import type { PlayerLookup } from './useGame'
import { playStrokes } from '../broadcast/RouteReplay'

const fixture = loadReplayFixture('packages/tsb/fixtures/tsb2026/replay-game-a.json.gz')

const fakeTeam = (id: number, abbr: string): RosterTeam => ({
  id,
  abbr,
  city: abbr,
  name: abbr,
  players: Array.from({ length: 30 }, (_, i) => ({ first: '', last: `${abbr}${i}`, number: i, position: 'QB' as const })),
})

const roster = [fakeTeam(0, 'BUF'), fakeTeam(5, 'CLE')]
const names = (side: 0 | 1, index: number) => `${side === 0 ? 'BUF' : 'CLE'}${index}`

function replay(name: string) {
  const tracker = new PlayTracker({ recordRoutes: true, names })
  const events: { frame: number; event: TrackerEvent }[] = []
  for (const snap of replaySnapshots(fixture, name)) {
    const state = decodeGameState(snap, TSB2026_MAP, roster)
    for (const event of tracker.push(state)) events.push({ frame: snap.frame, event })
  }
  return { tracker, events }
}

const framesOf = (events: { frame: number; event: TrackerEvent }[], type: TrackerEvent['type']) =>
  events.filter((e) => e.event.type === type).map((e) => e.frame)

test('real sack is finalized when the stats land with sack yardage and a SACK moment', () => {
  const { tracker, events } = replay('sack')
  expect(framesOf(events, 'playOver')).toEqual([23577])
  expect(framesOf(events, 'playEnd')).toEqual([23739])
  const [play] = tracker.plays()
  expect(play).toMatchObject({ offense: 0, sack: true, interception: false, yards: -7, summary: 'SACK, -7 YDS' })
  expect(tracker.moments().map((m) => m.kind)).toEqual(['SACK'])
})

test('real interception is finalized when the stats land and yields an INT moment', () => {
  const { tracker, events } = replay('interception')
  expect(framesOf(events, 'playOver')).toEqual([27174])
  expect(framesOf(events, 'playEnd')).toEqual([27282])
  const [play] = tracker.plays()
  expect(play).toMatchObject({ offense: 1, interception: true, summary: 'INTERCEPTED' })
  expect(tracker.moments().map((m) => m.kind)).toEqual(['INT'])
})

test('real 13 yard touchdown pass carries the receiver yards and is not a LONG_TD', () => {
  const { tracker, events } = replay('touchdown')
  expect(framesOf(events, 'playOver')[0]).toBe(11367)
  expect(framesOf(events, 'playEnd')[0]).toBe(11564)
  const play = tracker.plays()[0]
  expect(play).toMatchObject({ offense: 1, touchdown: true, yards: 13, summary: 'CLE0 PASS TO CLE6, 13 YDS, TOUCHDOWN' })
  expect(tracker.moments()).toEqual([])
  expect(tracker.longest(1, 'rec')).toBe(13)
})

test('routes are complete at the closing edge before the play is finalized', () => {
  const tracker = new PlayTracker({ recordRoutes: true, names })
  let atOver: number | null = null
  for (const snap of replaySnapshots(fixture, 'sack')) {
    const events = tracker.push(decodeGameState(snap, TSB2026_MAP, roster))
    if (events.some((e) => e.type === 'playOver')) {
      const pending = tracker.latestPlay()
      expect(pending?.summary).toBe('')
      atOver = pending?.routes[0].points.length ?? 0
    }
  }
  expect(atOver).toBeGreaterThan(100)
  expect(tracker.latestPlay()?.routes[0].points.length).toBe(atOver)
  expect(tracker.latestPlay()?.summary).toBe('SACK, -7 YDS')
})

test('a real punt closes the kicking drive as PUNT', () => {
  const { tracker } = replay('punt')
  const punt = tracker.plays()[tracker.plays().length - 1]
  expect(punt).toMatchObject({ offense: 0, kind: 'punt', kicked: true, summary: 'PUNT' })
  expect(tracker.drives()).toEqual([
    { offense: 0, plays: 2, yards: 0, startClock: '4:25', result: 'PUNT', startSpot: { yard: 22, side: 0 }, endSpot: { yard: 22, side: 0 }, endSummary: 'PUNT', endTime: '0:24' },
  ])
})

test('the real try is a play of no drive and the touchdown drive keeps one play', () => {
  const { tracker } = replay('touchdown')
  const [touchdown, pat] = tracker.plays()
  expect(touchdown.isTry).toBe(false)
  expect(pat).toMatchObject({ offense: 1, kind: 'scrimmage', isTry: true, summary: '2PT NO GOOD' })
  expect(tracker.drives()).toEqual([
    {
      offense: 1,
      plays: 1,
      yards: 13,
      startClock: '1:50',
      result: 'TD',
      startSpot: { yard: 13, side: 0 },
      endSpot: { yard: 0, side: 0 },
      endSummary: 'CLE0 PASS TO CLE6, 13 YDS, TOUCHDOWN',
      endTime: '0:09',
    },
  ])
})

test('the real opening kickoff is a kickoff of no drive', () => {
  const { tracker } = replay('kickoff')
  expect(tracker.plays()[0]).toMatchObject({ offense: 0, kind: 'kickoff', kicked: true, summary: 'KICKOFF' })
  expect(tracker.plays()[1]).toMatchObject({ offense: 0, kind: 'scrimmage', kicked: false, summary: 'BUF0 PASS INCOMPLETE' })
  expect(tracker.drives()).toEqual([
    { offense: 0, plays: 1, yards: 0, startClock: '4:49', result: 'IN_PROGRESS', startSpot: { yard: 27, side: 0 }, endSpot: { yard: 27, side: 0 }, endSummary: 'BUF0 PASS INCOMPLETE', endTime: '0:08' },
  ])
  expect(tracker.lastDrive()).toBeNull()
})

test('a real fumble lost after a catch writes no stats and reads FUMBLE LOST', () => {
  const { tracker, events } = replay('fumble')
  expect(framesOf(events, 'playEnd')).toEqual([19098])
  expect(tracker.plays()[0]).toMatchObject({ offense: 0, interception: false, summary: 'FUMBLE LOST' })
  expect(tracker.drives()).toEqual([
    { offense: 0, plays: 1, yards: 0, startClock: '4:43', result: 'FUMBLE', startSpot: { yard: 34, side: 1 }, endSpot: { yard: 34, side: 1 }, endSummary: 'FUMBLE LOST', endTime: '0:28' },
  ])
})

test('a run whose stats land inside the quarter break is finalized during the break', () => {
  const { tracker, events } = replay('quarter')
  expect(framesOf(events, 'playOver')).toEqual([17353])
  expect(framesOf(events, 'playEnd')).toEqual([17399])
  expect(tracker.plays()[0]).toMatchObject({ offense: 1, quarter: 0, yards: -5, summary: 'CLE2 RUSH, -5 YDS' })
})

test('real touchdown pass records the ball from the QB to the receiver and draws the throw', () => {
  const { tracker } = replay('touchdown')
  const play = tracker.plays().find((p) => p.touchdown)
  expect(play).toBeDefined()
  expect([...new Set(play!.ball.map((p) => p.slot))]).toEqual([11, 14])
  expect(play!.field.attacksHigh).toBe(false)
  expect(playStrokes(play!).map((s) => s.kind)).toEqual(['run', 'flight', 'run'])
})

test('real interception draws the return for the defense', () => {
  const { tracker } = replay('interception')
  const [play] = tracker.plays()
  expect(play.interception).toBe(true)
  const strokes = playStrokes(play)
  expect(strokes.at(-1)).toMatchObject({ kind: 'run', team: 0 })
  expect(play.offense).toBe(1)
})

test('real kickoff draws the kick and the return by the receiving team', () => {
  const { tracker } = replay('kickoff')
  const kick = tracker.plays().find((p) => p.kind === 'kickoff')
  expect(kick).toBeDefined()
  expect(playStrokes(kick!).map((s) => s.kind)).toEqual(['kick', 'run'])
})

test('plays carry frames, down and distance, all 22 tracks and who made the play', () => {
  const { tracker, events } = replay('sack')
  const [play] = tracker.plays()
  expect(play.startFrame).toBe(framesOf(events, 'snap')[0])
  expect(play).toMatchObject({ startFrame: 23366, endFrame: 23577, down: 2, toGo: 16, startBallOn: { yard: 36, side: 1 }, scoreBefore: [2, 6], scoreAfter: [2, 6] })
  expect(play.startFrame).toBeLessThan(play.endFrame)
  expect(play.tracks.players[0].length).toBe(22)
  expect(play.tracks.frames[0]).toBe(play.startFrame)
  expect(play.tracks.frames).toHaveLength(play.tracks.players.length)
  expect(play.tracks.frames).toHaveLength(play.routes[0].points.length)
  expect(play.tracks.players[0][0]).toEqual(play.routes[0].points[0])
  expect(play.people.defender).toMatchObject({ team: 1, kind: 'sack' })
  const touchdown = replay('touchdown').tracker.plays()[0]
  expect(touchdown.people).toMatchObject({ passer: 0, receiver: 6 })
  expect(touchdown.scoreAfter[1] - touchdown.scoreBefore[1]).toBe(6)
})

test('a drive ending on an interception reads INT and carries its spots and summary', () => {
  const { tracker } = replay('interception')
  expect(tracker.plays()[0].people.defender).toMatchObject({ team: 0, kind: 'int' })
  expect(tracker.lastDrive()).toEqual({
    offense: 1,
    plays: 1,
    yards: 0,
    startClock: '1:21',
    result: 'INT',
    startSpot: { yard: 49, side: 1 },
    endSpot: { yard: 49, side: 1 },
    endSummary: 'INTERCEPTED',
    endTime: '0:19',
  })
})

test('a real fumble out of bounds after a 61 yard run counts the ball path yards and names the runner', () => {
  const slot4 = loadReplayFixture('packages/tsb/fixtures/tsb2026/replay-slot4-fumble.json.gz')
  const teams = [fakeTeam(0, 'BUF'), fakeTeam(1, 'MIA')]
  const tracker = new PlayTracker({ recordRoutes: true, names: (side, index) => `${side === 0 ? 'BUF' : 'MIA'}${index}` })
  for (const snap of replaySnapshots(slot4, 'fumbleOutOfBounds')) tracker.push(decodeGameState(snap, TSB2026_MAP, teams))
  const [play] = tracker.plays()
  expect(play).toMatchObject({ offense: 1, kind: 'scrimmage', yards: 61, summary: 'MIA2 RUSH, 61 YDS, FUMBLE', people: { rusher: 2 } })
  expect(play.ball.at(-1)).toMatchObject({ x: 1753, slot: 12 })
  expect(tracker.longest(1, 'rush')).toBe(61)
  expect(tracker.drives()[0]).toMatchObject({ offense: 1, plays: 1, yards: 61, endSpot: { yard: 13, side: 0 } })
})

test('a completed pass flies from the release to the catch', () => {
  const { tracker } = replay('touchdown')
  const play = tracker.plays()[0]
  expect(play.pass?.outcome).toBe('caught')
  const catcher = play.ball.find((p) => p.slot === 14)
  expect(catcher).toBeDefined()
  expect(Math.hypot((play.pass?.to.x ?? 0) - (catcher?.x ?? 0), (play.pass?.to.y ?? 0) - (catcher?.y ?? 0))).toBeLessThan(12)
  const release = play.tracks.frames.indexOf(play.pass?.frames?.[0] ?? -1)
  expect(release).toBeGreaterThan(0)
  const qb = play.tracks.players[release][11]
  expect(Math.hypot((play.pass?.from.x ?? 0) - qb.x, (play.pass?.from.y ?? 0) - qb.y)).toBeLessThan(12)
})

test('the real touchdown pass caught deep in the end zone counts its air yards to the goal line', () => {
  const play = replay('touchdown').tracker.plays()[0]
  expect(Math.round((play.field.losX - (play.pass?.to.x ?? 0)) / 8)).toBe(16)
  expect(play).toMatchObject({ yards: 13, airYards: 13, yac: 0 })
})

test('the real punt and kickoff carry no pass', () => {
  for (const name of ['punt', 'kickoff']) {
    const kicks = replay(name).tracker.plays().filter((p) => p.kicked)
    expect(kicks.length).toBeGreaterThan(0)
    for (const kick of kicks) expect(kick).toMatchObject({ pass: null, airYards: null, yac: null })
  }
})

test('an intercepted pass ends at the defender who picked it off', () => {
  const { tracker } = replay('interception')
  expect(tracker.plays()[0].pass?.outcome).toBe('intercepted')
})

test('a fumble names who recovered it', () => {
  const lost = replay('fumble').tracker.plays()[0]
  expect(lost.fumble).toMatchObject({ at: { x: 2311, y: 54 }, frame: 18765, by: { team: 0, rosterIndex: 6 }, recoveredBy: { team: 1, rosterIndex: 25 }, recovery: { slot: 19, frame: 18893 }, lost: true })
  expect(lost.ball[lost.fumble!.index]).toMatchObject({ x: 2311, y: 54, slot: 3 })
  expect(lost.ball[lost.fumble!.recovery!.index]).toMatchObject({ slot: 19 })
  const cast: Record<string, RosterPlayer> = {
    '0:6': { first: 'Dalton', last: 'Kincaid', number: 86, position: 'TE' },
    '1:25': { first: 'Denzel', last: 'Ward', number: 21, position: 'DB' },
    '1:2': { first: "De'Von", last: 'Achane', number: 28, position: 'RB' },
  }
  const lookup: PlayerLookup = (team, index) => cast[`${team}:${index}`] ?? null
  expect(playHeadline(lost, lookup, 'full')).toBe('DALTON KINCAID FUMBLE, RECOVERED BY DENZEL WARD')
  const slot4 = loadReplayFixture('packages/tsb/fixtures/tsb2026/replay-slot4-fumble.json.gz')
  const tracker = new PlayTracker({ recordRoutes: true, names })
  for (const snap of replaySnapshots(slot4, 'fumbleOutOfBounds')) tracker.push(decodeGameState(snap, TSB2026_MAP, [fakeTeam(0, 'BUF'), fakeTeam(1, 'MIA')]))
  const out = tracker.plays()[0]
  expect(out.fumble).toMatchObject({ at: { x: 1753, y: 43 }, frame: 8747, by: { team: 1, rosterIndex: 2 }, recoveredBy: null, recovery: null, lost: false })
  expect(playHeadline(out, lookup, 'last')).toBe('ACHANE 61 YARD RUSH, FUMBLE, OUT OF BOUNDS')
  expect(replay('sack').tracker.plays()[0].fumble).toBeNull()
})

test('a real QB run on a pass play is a scramble and a designed QB run is a rush', () => {
  const run = (path: string, window: string) => {
    const tracker = new PlayTracker({ recordRoutes: false, names })
    for (const snap of replaySnapshots(loadReplayFixture(path), window)) tracker.push(decodeGameState(snap, TSB2026_MAP, roster))
    return tracker.plays()
  }
  const [scramble] = run('packages/tsb/fixtures/tsb2026/replay-scramble.json.gz', 'scramble')
  expect(scramble).toMatchObject({ offense: 0, call: 'pass', scramble: true, thrown: false, yards: 4, people: { rusher: 0 }, summary: 'BUF0 SCRAMBLE, 4 YDS' })
  const [designed] = run('packages/tsb/fixtures/tsb2026/replay-qb-run.json.gz', 'qbRun')
  expect(designed).toMatchObject({ offense: 0, call: 'run', scramble: false, yards: -7, people: { rusher: 0 }, summary: 'BUF0 RUSH, -7 YDS' })
})

test('every recorded scrimmage play carries the called play', () => {
  const calls = Object.fromEntries(['sack', 'touchdown', 'fumble', 'interception'].map((name) => [name, replay(name).tracker.plays()[0]?.call]))
  expect(calls).toEqual({ sack: 'pass', touchdown: 'pass', fumble: 'pass', interception: 'pass' })
  expect(replay('kickoff').tracker.plays().map((p) => [p.kind, p.call])).toEqual([['kickoff', null], ['scrimmage', 'pass']])
  expect(replay('punt').tracker.plays().map((p) => [p.kind, p.call])).toEqual([['scrimmage', 'pass'], ['punt', null]])
})

const replayFrom = (path: string, window: string) => {
  const tracker = new PlayTracker({ recordRoutes: true, names })
  for (const snap of replaySnapshots(loadReplayFixture(path), window)) tracker.push(decodeGameState(snap, TSB2026_MAP, roster))
  return tracker.plays()
}

const nobody: PlayerLookup = () => null

test('a touchback reads KICKOFF, TOUCHBACK in the last play', () => {
  const kickoff = replayFrom('packages/tsb/fixtures/tsb2026/replay-kickoff-touchback.json.gz', 'kickoffTouchback').find((p) => p.kind === 'kickoff')!
  expect(kickoff).toMatchObject({ kickResult: 'touchback', returner: null, returnYards: null })
  expect(playHeadline(kickoff, nobody, 'full')).toBe('KICKOFF, TOUCHBACK')
  const punt = replayFrom('packages/tsb/fixtures/tsb2026/replay-punt-touchback.json.gz', 'puntTouchback').find((p) => p.kind === 'punt')!
  expect(punt).toMatchObject({ kickResult: 'touchback', returner: null, returnYards: null })
  expect(playHeadline(punt, nobody, 'full')).toBe('PUNT, TOUCHBACK')
  const strokes = playStrokes(punt)
  expect(strokes.map((s) => s.kind)).toEqual(['kick'])
  expect(strokes[0].points.at(-1)!.x).toBeGreaterThan(TSB2026_MAP.fieldZeroX + 100 * 8)
})

test('a kickoff return names the returner and the yards', () => {
  const kick = replayFrom('packages/tsb/fixtures/tsb2026/replay-kickoff-return.json.gz', 'kickoffReturn').find((p) => p.kind === 'kickoff')!
  expect(kick).toMatchObject({ kickResult: 'return', returner: 5, returnYards: 15 })
  const cast: PlayerLookup = (team, index) => (team === 0 && index === 5 ? { first: 'Ty', last: 'Johnson', number: 26, position: 'RB' } : null)
  expect(playHeadline(kick, cast, 'full')).toBe('TY JOHNSON 15 YARD KICKOFF RETURN')
  for (const name of ['kickoff', 'scoreKickoff']) {
    const short = replay(name).tracker.plays().find((p) => p.kind === 'kickoff')!
    expect(short).toMatchObject({ kickResult: 'return', returner: 5, returnYards: 0 })
    expect(playHeadline(short, cast, 'full')).toBe('TY JOHNSON KICKOFF RETURN, NO GAIN')
  }
})

const allFixtures = (): [string, string][] =>
  [
    'replay-game-a.json.gz',
    'replay-deflection.json.gz',
    'replay-slot4-fumble.json.gz',
    'replay-scramble.json.gz',
    'replay-qb-run.json.gz',
    'replay-kickoff-return.json.gz',
    'replay-kickoff-touchback.json.gz',
    'replay-punt-touchback.json.gz',
  ].flatMap((file) => loadReplayFixture(`packages/tsb/fixtures/tsb2026/${file}`).windows.map((w): [string, string] => [`packages/tsb/fixtures/tsb2026/${file}`, w.name]))

test('on every completion in the fixtures the intended receiver is the catcher', () => {
  const caught = allFixtures().flatMap(([path, window]) => replayFrom(path, window)).filter((p) => p.pass?.outcome === 'caught')
  expect(caught.length).toBeGreaterThanOrEqual(2)
  for (const play of caught) {
    const catcher = play.people.receiver ?? play.fumble?.by?.rosterIndex
    expect(catcher).toBeDefined()
    expect(play.pass?.target).toBe(catcher)
  }
})

test('passes that are not caught carry the intended receiver', () => {
  const target = (path: string, window: string) => replayFrom(`packages/tsb/fixtures/tsb2026/${path}`, window).find((p) => p.pass)?.pass
  expect(target('replay-slot4-fumble.json.gz', 'incompletion')).toMatchObject({ outcome: 'incomplete', target: 10 })
  expect(target('replay-deflection.json.gz', 'deflection')).toMatchObject({ outcome: 'deflected', target: 6 })
  expect(target('replay-game-a.json.gz', 'interception')).toMatchObject({ outcome: 'intercepted', target: 6 })
  expect(replayFrom('packages/tsb/fixtures/tsb2026/replay-scramble.json.gz', 'scramble').every((p) => p.pass === null)).toBe(true)
})

test('the headlines name the intended receiver on real incompletions, knockdowns and interceptions', () => {
  const cast: Record<string, RosterPlayer> = {
    '0:0': { first: 'Josh', last: 'Allen', number: 17, position: 'QB' },
    '0:6': { first: 'Khalil', last: 'Shakir', number: 10, position: 'WR' },
    '1:26': { first: 'Rashad', last: 'Hickman', number: 30, position: 'DB' },
    '1:0': { first: 'Deshaun', last: 'Watson', number: 4, position: 'QB' },
    '1:6': { first: 'Amari', last: 'Cooper', number: 2, position: 'WR' },
    '0:24': { first: 'Jalen', last: 'Ramsey', number: 5, position: 'DB' },
  }
  const lookup: PlayerLookup = (side, index) => cast[`${side}:${index}`] ?? null
  const deflected = replayFrom('packages/tsb/fixtures/tsb2026/replay-deflection.json.gz', 'deflection').find((p) => p.pass)!
  expect(playHeadline(deflected, lookup, 'full')).toBe('JOSH ALLEN PASS INTENDED FOR KHALIL SHAKIR, KNOCKED DOWN BY RASHAD HICKMAN')
  const picked = replay('interception').tracker.plays().find((p) => p.interception)!
  expect(playHeadline(picked, lookup, 'full')).toBe('INTERCEPTED BY JALEN RAMSEY, INTENDED FOR AMARI COOPER')
  const missed = replay('kickoff').tracker.plays().find((p) => p.pass?.outcome === 'incomplete')!
  expect(playHeadline(missed, lookup, 'full')).toBe('JOSH ALLEN PASS INCOMPLETE, INTENDED FOR KHALIL SHAKIR')
})
