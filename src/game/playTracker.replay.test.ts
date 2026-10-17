import { expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots } from '../../tools/replayFixture'
import { decodeGameState } from './decode'
import { TSB2026_MAP } from './maps/tsb2026'
import { PlayTracker, type TrackerEvent } from './playTracker'
import type { RosterTeam } from './roster'

const fixture = loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz')

const fakeTeam = (id: number, abbr: string): RosterTeam => ({
  id,
  abbr,
  city: abbr,
  name: abbr,
  players: Array.from({ length: 30 }, (_, i) => ({ first: '', last: `${abbr}${i}`, position: 'QB' as const })),
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
