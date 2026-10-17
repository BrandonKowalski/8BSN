import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { LeagueGame } from '../../league/espn'
import AroundTheLeague, { leagueEntry } from './AroundTheLeague'
import BroadcastView, { packageVisible } from './BroadcastView'
import { teamColor, teamColors } from './teamColors'

afterEach(cleanup)

const names = () => 'COOK'

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    inGame: true,
    inBreak: false,
    live: false,
    playOver: false,
    touchdown: false,
    sack: false,
    kicked: false,
    playKind: 'scrimmage',
    isTry: false,
    quarter: 1,
    clock: { min: 3, sec: 12 },
    down: 3,
    yardsToGo: 4,
    ballOn: { yard: 30, side: 1 },
    offense: 0,
    possession: 0,
    teams: [
      { id: 0, abbr: 'BUF', name: 'BUF', score: 14, timeouts: 3, players: [] },
      { id: 1, abbr: 'MIA', name: 'MIA', score: 7, timeouts: 3, players: [] },
    ],
    positions: [],
    frame: 1,
    ...overrides,
  }
}

const game = (away: string, awayScore: number, home: string, homeScore: number, detail: string, state: LeagueGame['state'] = 'in'): LeagueGame => ({
  id: `${away}@${home}`,
  away: { abbr: away, score: awayScore },
  home: { abbr: home, score: homeScore },
  state,
  detail,
})

test('packageVisible is false off the field regardless of live or force', () => {
  expect(packageVisible(null, true, true)).toBe(false)
  expect(packageVisible(null, true, false)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, true)).toBe(false)
  expect(packageVisible(makeState({ inGame: false }), true, false)).toBe(false)
})

test('packageVisible with live detection follows live and ignores force', () => {
  expect(packageVisible(makeState({ live: false }), false, true)).toBe(true)
  expect(packageVisible(makeState({ live: true }), false, true)).toBe(false)
  expect(packageVisible(makeState({ live: false }), true, true)).toBe(true)
  expect(packageVisible(makeState({ live: true }), true, true)).toBe(false)
})

test('packageVisible without live detection equals forcePackage', () => {
  expect(packageVisible(makeState({ live: false }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: true }), false, false)).toBe(false)
  expect(packageVisible(makeState({ live: false }), true, false)).toBe(true)
  expect(packageVisible(makeState({ live: true }), true, false)).toBe(true)
})

test('the view is boxed between plays and unboxed the instant live turns true', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const slot = vi.fn()
  const { rerender } = render(<BroadcastView state={makeState({ live: false })} tracker={tracker} names={names} forcePackage={false} canvasSlot={slot} games={null} />)
  const view = screen.getByTestId('broadcast-view')
  expect(view).toHaveClass('boxed')
  expect(screen.getByTestId('stats-package')).toBeVisible()
  rerender(<BroadcastView state={makeState({ live: true })} tracker={tracker} names={names} forcePackage={false} canvasSlot={slot} games={null} />)
  expect(view).not.toHaveClass('boxed')
  expect(screen.getByTestId('stats-package')).not.toBeVisible()
})

test('the canvas slot element survives boxing and unboxing', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const slot = vi.fn()
  const { rerender } = render(<BroadcastView state={makeState({ live: true })} tracker={tracker} names={names} forcePackage={false} canvasSlot={slot} games={null} />)
  rerender(<BroadcastView state={makeState({ live: false })} tracker={tracker} names={names} forcePackage={false} canvasSlot={slot} games={null} />)
  rerender(<BroadcastView state={makeState({ live: true })} tracker={tracker} names={names} forcePackage={false} canvasSlot={slot} games={null} />)
  expect(slot.mock.calls.filter(([node]) => node === null)).toHaveLength(0)
})

test('off the field the view is not boxed and shows no scorebug', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState({ inGame: false })} tracker={tracker} names={names} forcePackage={true} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('broadcast-view')).not.toHaveClass('boxed')
  expect(screen.queryByTestId('scorebug')).toBeNull()
})

test('the scorebug shows both scores, the clock and down and distance', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState({ live: true })} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('BUF')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('MIA')
  expect(bug).toHaveTextContent('2ND 3:12')
  expect(bug).toHaveTextContent('3RD & 4')
})

test('AroundTheLeague renders nothing for null or no games', () => {
  const { container, rerender } = render(<AroundTheLeague games={null} />)
  expect(container).toBeEmptyDOMElement()
  rerender(<AroundTheLeague games={[]} />)
  expect(container).toBeEmptyDOMElement()
})

test('AroundTheLeague renders one entry per game', () => {
  render(<AroundTheLeague games={[game('KC', 24, 'BUF', 17, '4th 2:10'), game('SF', 31, 'SEA', 3, 'Final', 'post')]} />)
  const entries = screen.getAllByTestId('league-game')
  expect(entries).toHaveLength(2)
  expect(entries[0]).toHaveTextContent('KC 24 BUF 17 4Q 2:10')
  expect(entries[1]).toHaveTextContent('SF 31 SEA 3 FINAL')
})

test('leagueEntry formats quarters, halftime and overtime finals', () => {
  expect(leagueEntry(game('PHI', 10, 'DAL', 13, 'Halftime'))).toBe('PHI 10 DAL 13 HALF')
  expect(leagueEntry(game('NYG', 20, 'WSH', 23, 'Final/OT', 'post'))).toBe('NYG 20 WSH 23 FINAL/OT')
  expect(leagueEntry(game('DEN', 0, 'LV', 7, '1st 9:45'))).toBe('DEN 0 LV 7 1Q 9:45')
})

test('teamColors covers the ROM and ESPN abbreviations with a fallback', () => {
  for (const abbr of ['BUF', 'CLE', 'ARZ', 'ARI', 'WAS', 'WSH', 'LAR', 'JAX', 'KC', 'SF']) {
    expect(teamColors[abbr]).toBeDefined()
  }
  expect(teamColor('???')).toEqual({ primary: '#333', secondary: '#999' })
  expect(teamColor('ARZ')).toEqual(teamColor('ARI'))
})

test('the scorebug shows KICKOFF and PAT instead of down and distance', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { rerender } = render(<BroadcastView state={makeState({ live: true, playKind: 'kickoff', down: 1, yardsToGo: 0 })} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('scorebug')).toHaveTextContent('KICKOFF')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('GOAL')
  rerender(<BroadcastView state={makeState({ live: true, isTry: true, down: 1, yardsToGo: 2 })} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('scorebug')).toHaveTextContent('PAT')
  expect(screen.getByTestId('scorebug')).not.toHaveTextContent('1ST')
})

test('the scorebug ball marks the team holding the ball between plays', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const { container } = render(<BroadcastView state={makeState({ offense: 1, possession: 0 })} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  const teams = container.querySelectorAll('.bug-team')
  expect(teams[0].querySelector('.bug-ball')).not.toBeNull()
  expect(teams[1].querySelector('.bug-ball')).toBeNull()
})

test('during a break the view is boxed and the scorebug shows the scores and the break', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  const halftime = makeState({ inGame: false, inBreak: true, quarter: 1, clock: { min: 0, sec: 0 } })
  render(<BroadcastView state={halftime} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={null} />)
  expect(screen.getByTestId('broadcast-view')).toHaveClass('boxed')
  expect(screen.getByTestId('stats-package')).toBeVisible()
  const bug = screen.getByTestId('scorebug')
  expect(bug).toHaveTextContent('14')
  expect(bug).toHaveTextContent('2ND 0:00')
  expect(bug).toHaveTextContent('HALFTIME')
  expect(screen.getByTestId('current-drive')).toHaveTextContent('HALFTIME')
  expect(screen.getByTestId('current-drive')).not.toHaveTextContent('HALFTIME AT')
})

test('packageVisible is true during a break', () => {
  expect(packageVisible(makeState({ inGame: false, inBreak: true }), false, true)).toBe(true)
})

test('the package shows the league games passed in', () => {
  const tracker = new PlayTracker({ recordRoutes: false })
  render(<BroadcastView state={makeState()} tracker={tracker} names={names} forcePackage={false} canvasSlot={() => undefined} games={[game('BUF', 20, 'MIA', 17, 'Final', 'post')]} />)
  expect(screen.getByTestId('around-the-league')).toHaveTextContent('BUF 20')
})
