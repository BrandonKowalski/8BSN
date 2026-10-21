import { HOLD_FRAMES, type Press, Btn, type LeagueGame, type Tailgate } from '@8bsn/sdk'
import { lastPlayMs } from '../broadcast/StatsPackage'
import type { TsbView } from './session'
import { onAir } from './format'
import { TSB2026_MAP } from './maps/tsb2026'
import { tsbRom } from './roms'

export type Cell = [number, number]

export const GRID_ROWS = 8
export const NUDGE_FRAMES = 240
const COLUMNS = 4

export function cellOf(grid: readonly string[], abbr: string, toRom: (abbr: string) => string): Cell | null {
  const index = grid.indexOf(toRom(abbr))
  return index < 0 ? null : [Math.floor(index / GRID_ROWS), index % GRID_ROWS]
}

export type Matchup = { away: string; home: string; cells: [Cell, Cell] }

export function pickMatchup(games: readonly LeagueGame[] | null, grid: readonly string[] | undefined, toRom: (abbr: string) => string, random: () => number = Math.random): Matchup | null {
  if (!grid) return null
  const upcoming = (games ?? []).flatMap((g) => {
    const away = cellOf(grid, g.away.abbr, toRom)
    const home = cellOf(grid, g.home.abbr, toRom)
    return g.state === 'pre' && away && home ? [{ away: g.away.abbr, home: g.home.abbr, cells: [away, home] as [Cell, Cell] }] : []
  })
  return upcoming.length === 0 ? null : upcoming[Math.floor(random() * upcoming.length)]
}

export function randomCells(columns: number, rows: number, random: () => number = Math.random): [Cell, Cell] {
  const cell = (): Cell => [Math.floor(random() * columns), Math.floor(random() * rows)]
  const first = cell()
  let second = cell()
  while (second[0] === first[0] && second[1] === first[1]) second = cell()
  return [first, second]
}

type Step = { wait: number } | { press: number }

const press = (mask: number, gap: number): Step[] => [{ press: mask }, { wait: gap }]
const repeat = (mask: number, times: number, gap: number): Step[] => Array.from({ length: times }, () => press(mask, gap)).flat()
const moves = ([across, down]: Cell): Step[] => [...repeat(Btn.RIGHT, across, 15), ...repeat(Btn.DOWN, down, 15)]

export function attractScript([first, second]: [Cell, Cell]): Press[] {
  const steps: Step[] = [
    { wait: 300 },
    ...press(Btn.START, 120),
    ...press(Btn.START, 90),
    ...press(Btn.A, 90),
    ...press(Btn.A, 90),
    ...repeat(Btn.DOWN, 5, 20),
    ...press(Btn.A, 60),
    ...moves(first),
    ...press(Btn.A, 45),
    ...moves(second),
    ...press(Btn.A, 60),
    ...press(Btn.A, 120),
  ]
  const presses: Press[] = []
  let at = 0
  for (const step of steps) {
    if ('wait' in step) at += step.wait
    else {
      presses.push({ at, mask: step.press })
      at += HOLD_FRAMES
    }
  }
  return presses
}

export function nudgeMask(frame: number, inBreak: boolean): number {
  return inBreak && frame % NUDGE_FRAMES < HOLD_FRAMES ? Btn.START : 0
}

export const tsbTailgate: Tailgate<TsbView> = {
  label: 'TAILGATE',
  script: ({ games, toRom, sha1, random }) => attractScript(pickMatchup(games, tsbRom(sha1).selectGrid, toRom, random)?.cells ?? randomCells(COLUMNS, GRID_ROWS, random)),
  autoInput: (snapshot, frames) => [nudgeMask(frames, (snapshot.ram[TSB2026_MAP.gameStatus.offset] ?? 0) === TSB2026_MAP.breakValue), 0],
  hold: (d) => d.boxed && d.state?.playSelect === true,
  holdMs: (d) => lastPlayMs(d.tracker.latestPlay()),
  finished: (d) => d.started && !onAir(d.state) && d.final === null,
}
