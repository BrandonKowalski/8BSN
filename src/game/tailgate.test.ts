import { expect, test } from 'vitest'
import { Btn } from '../input/buttons'
import { TSB_LEAGUE } from './league'
import { leagueData } from '../league/leagueData'
import { emptySnapshot } from '../emu/snapshot'
import { TSB1991, TSB2026, TSB2026_GRID } from './roms'
import type { LeagueGame } from '../sdk/types'
import { HOLD_FRAMES, maskAt, scriptEnd } from '../emu/autoplay'
import { attractScript, cellOf, NUDGE_FRAMES, nudgeMask, pickMatchup, randomCells, tsbTailgate } from './tailgate'
import { PlayTracker } from './playTracker'
import type { GameState } from './types'
import type { TsbView } from './session'

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

const { toRom } = leagueData(TSB_LEAGUE, null, null)

test('grid cells run down each column of the team select screen and ESPN spellings map to the ROM', () => {
  expect(cellOf(TSB2026_GRID, 'BUF', toRom)).toEqual([0, 0])
  expect(cellOf(TSB2026_GRID, 'DAL', toRom)).toEqual([0, 7])
  expect(cellOf(TSB2026_GRID, 'CIN', toRom)).toEqual([1, 0])
  expect(cellOf(TSB2026_GRID, 'WSH', toRom)).toEqual([0, 4])
  expect(cellOf(TSB2026_GRID, 'ARI', toRom)).toEqual([3, 7])
  expect(cellOf(TSB2026_GRID, 'XYZ', toRom)).toBeNull()
})

test('the matchup comes from an upcoming game with the away team first', () => {
  const games = [game('KC', 'BUF', 'post'), game('SF', 'SEA', 'in'), game('DET', 'GB', 'pre'), game('NYJ', 'MIA', 'pre')]
  expect(pickMatchup(games, TSB2026_GRID, toRom, () => 0)).toEqual({ away: 'DET', home: 'GB', cells: [[1, 5], [1, 6]] })
  expect(pickMatchup(games, TSB2026_GRID, toRom, () => 0.99)?.away).toBe('NYJ')
})

test('without upcoming games or a known grid there is no matchup', () => {
  expect(pickMatchup([game('KC', 'BUF', 'post')], TSB2026_GRID, toRom)).toBeNull()
  expect(pickMatchup(null, TSB2026_GRID, toRom)).toBeNull()
  expect(pickMatchup([game('DET', 'GB', 'pre')], undefined, toRom)).toBeNull()
})

test('random cells never pick the same team twice', () => {
  const draws = [0, 0, 0, 0, 0.5, 0.5]
  expect(randomCells(4, 8, () => draws.shift() ?? 0.5)).toEqual([[0, 0], [2, 4]])
})

const pick = (sha1: string, games: LeagueGame[] | null, draws: number[]) => ({ games, toRom, sha1, random: () => draws.shift() ?? 0.5 })

test('the tailgate picks an upcoming matchup on the TSB 2026 grid', () => {
  const games = [game('DET', 'GB', 'pre')]
  expect(tsbTailgate.label).toBe('TAILGATE')
  expect(tsbTailgate.script(pick(TSB2026.sha1, games, [0]))).toEqual(attractScript([[1, 5], [1, 6]]))
})

test('the 1991 ROM falls back to random cells', () => {
  const games = [game('DET', 'GB', 'pre')]
  expect(tsbTailgate.script(pick(TSB1991.sha1, games, [0, 0, 0, 0, 0.5, 0.5]))).toEqual(attractScript([[0, 0], [2, 4]]))
})

test('after the script the tailgate taps START only during a break', () => {
  const snap = emptySnapshot()
  expect(tsbTailgate.autoInput?.(snap, NUDGE_FRAMES)).toEqual([0, 0])
  snap.ram[0x07] = 0x03
  expect(tsbTailgate.autoInput?.(snap, NUDGE_FRAMES)).toEqual([Btn.START, 0])
  expect(tsbTailgate.autoInput?.(snap, NUDGE_FRAMES + HOLD_FRAMES)).toEqual([0, 0])
})

const view = (over: Partial<TsbView>): TsbView => ({
  state: null,
  final: null,
  tracker: new PlayTracker({ recordRoutes: false }),
  events: [],
  player: () => null,
  helmets: new Map(),
  records: null,
  boxed: false,
  pregame: false,
  started: false,
  wipe: { wipe: null, held: null, celebrating: false },
  band: { ticker: null, leaving: false, entering: false, offsetMs: 0 },
  screened: false,
  romSha1: '',
  abbrs: ['BUF', 'MIA'],
  ...over,
})
const at = (over: Partial<GameState>) => ({ inGame: true, inBreak: false, playSelect: false, ...over }) as GameState

test('the tailgate holds at play select in the window', () => {
  expect(tsbTailgate.hold(view({ boxed: true, state: at({ playSelect: true }) }))).toBe(true)
  expect(tsbTailgate.hold(view({ boxed: false, state: at({ playSelect: true }) }))).toBe(false)
  expect(tsbTailgate.hold(view({ boxed: true, state: at({ playSelect: false }) }))).toBe(false)
  expect(tsbTailgate.holdMs(view({}))).toBe(0)
})

test('the game is finished once it started and left the air with no end of game screen', () => {
  const off = at({ inGame: false })
  expect(tsbTailgate.finished(view({ started: true, state: off }))).toBe(true)
  expect(tsbTailgate.finished(view({ started: true, state: null }))).toBe(true)
  expect(tsbTailgate.finished(view({ started: false, state: off }))).toBe(false)
  expect(tsbTailgate.finished(view({ started: true, state: at({}) }))).toBe(false)
  expect(tsbTailgate.finished(view({ started: true, state: at({ inGame: false, inBreak: true }) }))).toBe(false)
  expect(tsbTailgate.finished(view({ started: true, state: off, final: at({}) }))).toBe(false)
})
