import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker, type PlayResult, type TrackerEvent } from '../game/playTracker'
import type { RosterPlayer } from '../game/roster'
import type { GameState, TeamState } from '../game/types'
import type { PlayerLookup } from '../game/useGame'
import LowerTicker, { BAND_EXIT_MS, LINEUP_SEEN_MS, lineupMs, useLowerTicker } from './LowerTicker'
import css from './broadcast.css?raw'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const team = (abbr: string): TeamState => ({ id: 0, abbr, name: abbr, city: '', score: 0, timeouts: 3, players: [] })

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
  clock: { min: 15, sec: 0 },
  down: 1,
  yardsToGo: 10,
  ballOn: { yard: 25, side: 0 },
  offense: 0,
  possession: 0,
  teams: [team('BUF'), team('MIA')],
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
  frame: 0,
  ...o,
})

const cast: Record<string, RosterPlayer> = {
  '0:0': { first: 'Josh', last: 'Allen', number: 17, position: 'QB' },
  '0:1': { first: 'James', last: 'Cook', number: 4, position: 'RB' },
  '1:0': { first: 'Jaelan', last: 'Phillips', number: 15, position: 'DL' },
  '1:1': { first: 'Zach', last: 'Sieler', number: 92, position: 'DL' },
  '1:5': { first: 'KaVontae', last: 'Turpin', number: 84, position: 'WR' },
}
const player: PlayerLookup = (side, index) => cast[`${side}:${index}`] ?? null

const lineup = (_side: 0 | 1, unit: 'offense' | 'defense') => {
  const offense = unit === 'offense'
  return [
    { entry: offense ? 0 : 11, role: offense ? 'QB' : 'RE', rosterIndex: 0 },
    { entry: offense ? 1 : 12, role: offense ? 'RB' : 'NT', rosterIndex: 1 },
  ]
}

const wide = (_side: 0 | 1, unit: 'offense' | 'defense') => Array.from({ length: 11 }, (_, i) => ({ entry: i + (unit === 'defense' ? 11 : 0), role: 'QB', rosterIndex: 0 }))

function Harness({ events, tracker, visible = true, generation = 0 }: { events: TrackerEvent[]; tracker: PlayTracker; visible?: boolean; generation?: number }) {
  const band = useLowerTicker(events, tracker, visible, generation)
  return <LowerTicker band={band} abbrs={['BUF', 'MIA']} player={player} />
}

const play = (t: PlayTracker, o: Partial<GameState>) => [
  ...t.push(state({ ...o, live: true })),
  ...t.push(state({ ...o, playOver: true })),
  ...t.push(state({ ...o })),
]

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

const items = () => screen.getAllByTestId('lower-ticker-item').map((n) => n.textContent)

test('the play select before the first offensive snap shows that offense', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false, lineup })
  const kickoff = play(tracker, { playKind: 'kickoff', kicked: true })
  const { rerender } = render(<Harness events={kickoff} tracker={tracker} />)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
  rerender(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  const band = screen.getByTestId('lower-ticker')
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('BUF OFFENSE')
  expect(items()).toEqual(['QB #17 JOSH ALLEN', 'RB #4 JAMES COOK'])
  expect(band).toHaveStyle({ '--team-primary': '#00338d' })
  wait(lineupMs(2) - 1)
  expect(band).not.toHaveClass('lower-ticker-leaving')
  wait(1)
  expect(band).toHaveClass('lower-ticker-leaving')
  wait(BAND_EXIT_MS)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
})

test('a save load clears the band and drops the events that came with it', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false, lineup })
  const { rerender } = render(<Harness events={[]} tracker={tracker} />)
  rerender(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker')).toBeInTheDocument()
  const other = new PlayTracker({ recordRoutes: false, lineup })
  rerender(<Harness events={other.push(state({ playSelect: true }))} tracker={tracker} generation={1} />)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
})

test('the next play select shows the defense', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false, lineup })
  play(tracker, { playKind: 'kickoff', kicked: true })
  const { rerender } = render(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('BUF OFFENSE')
  wait(LINEUP_SEEN_MS)
  rerender(<Harness events={play(tracker, {})} tracker={tracker} />)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
  rerender(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('MIA DEFENSE')
  expect(items()).toEqual(['RE #15 JAELAN PHILLIPS', 'NT #92 ZACH SIELER'])
})

test('a lineup counts as shown only after three seconds on screen and stays due when the snap cuts it short', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false, lineup: wide })
  const { rerender } = render(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  wait(LINEUP_SEEN_MS - 1)
  expect(tracker.sidecar().lineupsShown).toEqual([])
  rerender(<Harness events={play(tracker, {})} tracker={tracker} />)
  wait(LINEUP_SEEN_MS)
  expect(tracker.sidecar().lineupsShown).toEqual([])
  rerender(<Harness events={tracker.push(state({ playSelect: true }))} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker-title')).toHaveTextContent('BUF OFFENSE')
  wait(LINEUP_SEEN_MS)
  expect(tracker.sidecar().lineupsShown).toEqual(['offense0'])
})

test('the band clock stops while the band is hidden and the scroll picks up where it stopped', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false, lineup: wide })
  const events = tracker.push(state({ playSelect: true }))
  const { rerender } = render(<Harness events={events} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker-track')).toHaveStyle({ animationDelay: '-0ms' })
  wait(1000)
  rerender(<Harness events={events} tracker={tracker} visible={false} />)
  wait(60000)
  expect(tracker.sidecar().lineupsShown).toEqual([])
  rerender(<Harness events={events} tracker={tracker} />)
  expect(screen.getByTestId('lower-ticker-track')).toHaveStyle({ animationDelay: '-1000ms' })
  wait(LINEUP_SEEN_MS - 1001)
  expect(tracker.sidecar().lineupsShown).toEqual([])
  wait(1)
  expect(tracker.sidecar().lineupsShown).toEqual(['offense0'])
  wait(lineupMs(11) - LINEUP_SEEN_MS)
  expect(screen.getByTestId('lower-ticker')).toHaveClass('lower-ticker-leaving')
})

test('the lineup track starts with the first name at the left edge', () => {
  const track = css.slice(css.indexOf('.lower-ticker-track {'), css.indexOf('}', css.indexOf('.lower-ticker-track {')))
  expect(track).toContain('padding-left: 1.6cqw')
  expect(track).not.toContain('100%')
})

const kick = (o: Partial<PlayResult>): PlayResult => ({
  index: 0,
  offense: 0,
  quarter: 0,
  yards: 0,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: true,
  thrown: false,
  call: null,
  scramble: false,
  kind: 'kickoff',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: null, attacksHigh: true },
  summary: 'KICKOFF',
  startFrame: 0,
  endFrame: 1,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 35, side: 1 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  fumble: null,
  kickResult: 'return',
  returner: 5,
  returnYards: 32,
  ...o,
})

test('a kick return produces no band message', () => {
  vi.useFakeTimers()
  const tracker = new PlayTracker({ recordRoutes: false })
  const { rerender } = render(<Harness events={[{ type: 'playEnd', play: kick({ offense: 1 }) }]} tracker={tracker} />)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
  rerender(<Harness events={[{ type: 'playEnd', play: kick({ index: 1, kickResult: 'touchback', returner: null, returnYards: null }) }]} tracker={tracker} />)
  expect(screen.queryByTestId('lower-ticker')).toBeNull()
})
