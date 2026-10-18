import { expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../tools/replayFixture'
import { decodeGameState } from './decode'
import { TSB2026_MAP } from './maps/tsb2026'
import { PlayTracker, type TrackerEvent } from './playTracker'
import type { RosterTeam } from './roster'
import { playStrokes } from '../views/broadcast/RouteReplay'

const fixture = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')

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
  expect(tracker.drives()).toEqual([{ offense: 0, plays: 2, yards: 0, startClock: '4:25', result: 'PUNT' }])
})

test('the real try is a play of no drive and the touchdown drive keeps one play', () => {
  const { tracker } = replay('touchdown')
  const [touchdown, pat] = tracker.plays()
  expect(touchdown.isTry).toBe(false)
  expect(pat).toMatchObject({ offense: 1, isTry: true, summary: 'PAT NO GOOD' })
  expect(tracker.drives()).toEqual([{ offense: 1, plays: 1, yards: 13, startClock: '1:50', result: 'TD' }])
})

test('the real opening kickoff is a kickoff of no drive', () => {
  const { tracker } = replay('kickoff')
  expect(tracker.plays()[0]).toMatchObject({ offense: 0, kind: 'kickoff', kicked: true, summary: 'KICKOFF' })
  expect(tracker.plays()[1]).toMatchObject({ offense: 0, kind: 'scrimmage', kicked: false, summary: 'BUF0 PASS INCOMPLETE' })
  expect(tracker.drives()).toEqual([{ offense: 0, plays: 1, yards: 0, startClock: '4:49', result: 'IN_PROGRESS' }])
})

test('a real fumble lost after a catch writes no stats and reads FUMBLE LOST', () => {
  const { tracker, events } = replay('fumble')
  expect(framesOf(events, 'playEnd')).toEqual([19098])
  expect(tracker.plays()[0]).toMatchObject({ offense: 0, interception: false, summary: 'FUMBLE LOST' })
  expect(tracker.drives()).toEqual([{ offense: 0, plays: 1, yards: 0, startClock: '4:43', result: 'TURNOVER' }])
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
