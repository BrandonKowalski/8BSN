import { parseRoster, TSB1991_ROSTER, TSB2026_ROSTER, type PlayerFix, type RosterLayout, type RosterTeam } from './roster'
import type { RomInfo } from '@8bsn/sdk'
import { TSB1991_COLORS, type TeamColor } from '../broadcast/teamColors'

export type TsbRom = RomInfo & {
  roster: RosterLayout
  players: PlayerFix[]
  colors: Record<string, TeamColor>
  selectGrid?: readonly string[]
}

export type RomImage = { bytes: Uint8Array; rom: RomInfo }

export const TSB2026_GRID = [
  'BUF', 'MIA', 'NE', 'NYJ', 'WAS', 'NYG', 'PHI', 'DAL',
  'CIN', 'CLE', 'BAL', 'PIT', 'CHI', 'DET', 'GB', 'MIN',
  'IND', 'HOU', 'JAX', 'TEN', 'TB', 'NO', 'ATL', 'CAR',
  'DEN', 'KC', 'LV', 'LAC', 'SF', 'LAR', 'SEA', 'ARZ',
]

const NFLPA_HOLDOUTS: PlayerFix[] = [
  { team: 'BUF', slot: 0, first: 'Jim', last: 'Kelly', number: 12 },
  { team: 'CLE', slot: 0, first: 'Bernie', last: 'Kosar', number: 19 },
  { team: 'PHI', slot: 0, first: 'Randall', last: 'Cunningham', number: 12 },
]

const SHORTENED_NAMES: PlayerFix[] = [
  { team: 'BUF', slot: 23, first: 'Cornelius', last: 'Bennett' },
  { team: 'JETS', slot: 0, first: 'Ken', last: "O'Brien" },
  { team: 'CIN', slot: 5, first: 'Stanford', last: 'Jennings' },
  { team: 'CLE', slot: 6, first: 'Webster', last: 'Slaughter' },
  { team: 'PIT', slot: 13, first: 'Brian', last: 'Blankenship' },
  { team: 'KC', slot: 0, first: 'Steve', last: 'DeBerg' },
  { team: 'RAI', slot: 24, first: 'Lionel', last: 'Washington' },
  { team: 'SD', slot: 16, first: 'Broderick', last: 'Thompson' },
  { team: 'SD', slot: 20, first: 'Leslie', last: "O'Neal" },
  { team: 'PHI', slot: 16, first: 'Reggie', last: 'Singletary' },
  { team: 'MIN', slot: 20, first: 'Mike', last: 'Merriweather' },
  { team: 'MIN', slot: 26, first: 'Darrell', last: 'Fullington' },
]

export const TSB2026: TsbRom = {
  sha1: '25ab46078b26380cab04bac01bf9b1c5a2efa432',
  title: 'Tecmo Super Bowl 2026',
  about: 'SBlueman\'s Week One Edition (Hardmode + Flicker Patch), ',
  roster: TSB2026_ROSTER,
  players: [],
  colors: {},
  selectGrid: TSB2026_GRID,
}

export const TSB1991: TsbRom = {
  sha1: '0f0284970cffc719c9993a9303e72077c0f8513a',
  title: 'Tecmo Super Bowl',
  about: 'Original 1991 NES release (USA)',
  roster: TSB1991_ROSTER,
  players: [...NFLPA_HOLDOUTS, ...SHORTENED_NAMES],
  colors: TSB1991_COLORS,
}

export const TSB_ROMS: readonly TsbRom[] = [TSB2026, TSB1991]

export function tsbRom(sha1: string): TsbRom {
  const found = TSB_ROMS.find((rom) => rom.sha1 === sha1)
  if (!found) throw new Error(`No Tecmo Super Bowl ROM has SHA-1 ${sha1}`)
  return found
}

export const rosterOf = ({ bytes, rom }: RomImage): RosterTeam[] => {
  const { roster, players } = tsbRom(rom.sha1)
  return parseRoster(bytes, roster, players)
}
