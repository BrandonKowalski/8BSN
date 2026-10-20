import { expect, test } from 'vitest'
import { Btn } from '../input/buttons'
import type { LeagueGame } from '../league/espn'
import { cellOf, pickMatchup, randomCells, TSB2026_GRID } from './matchup'
import { attractScript, HOLD_FRAMES, maskAt, scriptEnd } from './script'
import { NUDGE_FRAMES, nudgeMask } from './useAttract'

test('the script walks the menus to COM VS COM and steers both team cursors from the top left', () => {
  const presses = attractScript([[2, 1], [0, 3]])
  expect(presses.map((p) => p.mask)).toEqual([
    Btn.START, Btn.START, Btn.A, Btn.A, ...Array(5).fill(Btn.DOWN), Btn.A,
    Btn.RIGHT, Btn.RIGHT, Btn.DOWN, Btn.A,
    Btn.DOWN, Btn.DOWN, Btn.DOWN, Btn.A, Btn.A,
  ])
  expect(presses[0].at).toBe(300)
})

test('each press is held for a few frames and released before the next', () => {
  const presses = attractScript([[3, 7], [3, 7]])
  expect(maskAt(presses, presses[0].at)).toBe(Btn.START)
  expect(maskAt(presses, presses[0].at + HOLD_FRAMES)).toBe(0)
  expect(maskAt(presses, 0)).toBe(0)
  expect(scriptEnd(presses)).toBe(presses[presses.length - 1].at + HOLD_FRAMES)
  presses.slice(1).forEach((p, i) => expect(p.at).toBeGreaterThan(presses[i].at + HOLD_FRAMES))
})

test('during a break START is tapped now and then to move the game along', () => {
  expect(nudgeMask(NUDGE_FRAMES, true)).toBe(Btn.START)
  expect(nudgeMask(NUDGE_FRAMES + HOLD_FRAMES, true)).toBe(0)
  expect(nudgeMask(NUDGE_FRAMES, false)).toBe(0)
})

const game = (away: string, home: string, state: LeagueGame['state']): LeagueGame => ({
  id: `${away}@${home}`,
  state,
  detail: '',
  date: '2026-10-25T17:00Z',
  away: { abbr: away, score: 0 },
  home: { abbr: home, score: 0 },
})

test('grid cells run down each column of the team select screen and ESPN spellings map to the ROM', () => {
  expect(cellOf(TSB2026_GRID, 'BUF')).toEqual([0, 0])
  expect(cellOf(TSB2026_GRID, 'DAL')).toEqual([0, 7])
  expect(cellOf(TSB2026_GRID, 'CIN')).toEqual([1, 0])
  expect(cellOf(TSB2026_GRID, 'WSH')).toEqual([0, 4])
  expect(cellOf(TSB2026_GRID, 'ARI')).toEqual([3, 7])
  expect(cellOf(TSB2026_GRID, 'XYZ')).toBeNull()
})

test('the matchup comes from an upcoming game with the away team first', () => {
  const games = [game('KC', 'BUF', 'post'), game('SF', 'SEA', 'in'), game('DET', 'GB', 'pre'), game('NYJ', 'MIA', 'pre')]
  expect(pickMatchup(games, TSB2026_GRID, () => 0)).toEqual({ away: 'DET', home: 'GB', cells: [[1, 5], [1, 6]] })
  expect(pickMatchup(games, TSB2026_GRID, () => 0.99)?.away).toBe('NYJ')
})

test('without upcoming games or a known grid there is no matchup', () => {
  expect(pickMatchup([game('KC', 'BUF', 'post')], TSB2026_GRID)).toBeNull()
  expect(pickMatchup(null, TSB2026_GRID)).toBeNull()
  expect(pickMatchup([game('DET', 'GB', 'pre')], undefined)).toBeNull()
})

test('random cells never pick the same team twice', () => {
  const draws = [0, 0, 0, 0, 0.5, 0.5]
  expect(randomCells(4, 8, () => draws.shift() ?? 0.5)).toEqual([[0, 0], [2, 4]])
})
