import type { LeagueGame } from '../sdk/types'

export type Cell = [number, number]

export const GRID_ROWS = 8

export const TSB2026_GRID = [
  'BUF', 'MIA', 'NE', 'NYJ', 'WAS', 'NYG', 'PHI', 'DAL',
  'CIN', 'CLE', 'BAL', 'PIT', 'CHI', 'DET', 'GB', 'MIN',
  'IND', 'HOU', 'JAX', 'TEN', 'TB', 'NO', 'ATL', 'CAR',
  'DEN', 'KC', 'LV', 'LAC', 'SF', 'LAR', 'SEA', 'ARZ',
]

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
