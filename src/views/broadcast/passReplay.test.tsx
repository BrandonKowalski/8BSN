import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { loadReplayFixture, replaySnapshots, type ReplayFixture } from '../../../tools/replayFixture'
import { decodeGameState } from '../../game/decode'
import { TSB2026_MAP } from '../../game/maps/tsb2026'
import { PlayTracker } from '../../game/playTracker'
import type { RosterPlayer, RosterTeam } from '../../game/roster'
import type { PlayerLookup } from '../../game/useGame'
import RouteReplay from './RouteReplay'
import { teamColor } from './teamColors'

afterEach(cleanup)

const team = (id: number, abbr: string): RosterTeam => ({
  id,
  abbr,
  city: abbr,
  name: abbr,
  players: Array.from({ length: 30 }, (_, i) => ({ first: 'Test', last: `${abbr}${i}`, number: i, position: 'QB' as const })),
})
const roster = [team(0, 'BUF'), team(1, 'MIA'), team(5, 'CLE')]
const ward: RosterPlayer = { first: 'Denzel', last: 'Ward', number: 24, position: 'DB' }
const lookup: PlayerLookup = (side, index) => (side === 1 && index === 26 ? ward : null)

function lastPlay(fixture: ReplayFixture, window: string) {
  const tracker = new PlayTracker({ recordRoutes: true })
  for (const snap of replaySnapshots(fixture, window)) tracker.push(decodeGameState(snap, TSB2026_MAP, roster))
  const play = tracker.plays().at(-1)
  if (!play) throw new Error(`no play in ${window}`)
  return play
}

const endOf = (d: string | null) => d?.match(/(-?[\d.]+),(-?[\d.]+)$/)?.slice(1).map(Number)

test('an incomplete pass draws the throw to where it fell', () => {
  const play = lastPlay(loadReplayFixture('tests/fixtures/tsb2026/replay-slot4-fumble.json.gz'), 'incompletion')
  expect(play.pass).toMatchObject({ outcome: 'incomplete', from: { x: 0x90b, y: 0x80 }, to: { x: 0x88b, y: 0x93 } })
  expect(play.pass?.by).toBeUndefined()
  render(<RouteReplay play={play} abbrs={['BUF', 'MIA']} player={lookup} />)
  expect(endOf(screen.getByTestId('ball-flight').getAttribute('d'))).toEqual([0x88b, 0x93])
  expect(screen.getByTestId('pass-end')).toHaveTextContent('INC')
})

test('a knocked down pass marks the spot and names the defender', () => {
  const play = lastPlay(loadReplayFixture('tests/fixtures/tsb2026/replay-deflection.json.gz'), 'deflection')
  expect(play.pass).toMatchObject({ outcome: 'deflected', to: { x: 0x7c2, y: 0x40 }, by: { team: 1, rosterIndex: 26 } })
  render(<RouteReplay play={play} abbrs={['BUF', 'CLE']} player={lookup} />)
  expect(endOf(screen.getByTestId('ball-flight').getAttribute('d'))).toEqual([0x7c2, 0x40])
  expect(screen.getByTestId('pass-end')).toHaveTextContent(/^KNOCKED DOWN BY #24 D. WARD DB$/)
})

test('a lost fumble draws the recovery in the defense color', () => {
  const play = lastPlay(loadReplayFixture('tests/fixtures/tsb2026/replay-game-a.json.gz'), 'fumble')
  const milano: RosterPlayer = { first: 'Matt', last: 'Milano', number: 55, position: 'LB' }
  render(<RouteReplay play={play} abbrs={['BUF', 'CLE']} player={(side, index) => (side === 1 && index === 25 ? milano : null)} />)
  const recovery = screen.getByTestId('fumble-recovery')
  expect(recovery.getAttribute('stroke')).toBe(teamColor('CLE').primary)
  expect(recovery.getAttribute('d')).toMatch(/^M2311,54L/)
  expect(screen.getByTestId('fumble-burst')).toBeInTheDocument()
  expect(screen.getByTestId('fumble-label')).toHaveTextContent(/^RECOVERED BY #55 MATT MILANO LB$/)
  expect(screen.queryByText('FUMBLE')).toBeNull()
  const strokes = screen.getAllByTestId('ball-path')
  expect(strokes.some((s) => (s.getAttribute('d') ?? '').includes('2298,48'))).toBe(false)
})
