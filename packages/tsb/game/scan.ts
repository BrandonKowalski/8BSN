import type { RomScan, RomScanner } from '@8bsn/sdk'
import { parseRoster, TSB2026_ROSTER, type RosterTeam } from './roster'

const PRG_BANKS = 0x10
const CHR_BANKS = 0x20
const MMC3 = 4
const SIZE = 16 + PRG_BANKS * 16384 + CHR_BANKS * 8192
const TEAMS = 32
const PLAYERS = 30

const ENGINE = [
  [0x8d, 0x99, 0x03],
  [0x8d, 0x9e, 0x03],
  [0xa5, 0x76],
  [0xa5, 0x77],
  [0xa5, 0x71],
]

const fail = (reason: string): RomScan => ({ ok: false, reason })

const printable = (text: string) => /^[\x20-\x7e]+$/.test(text)

const readable = (team: RosterTeam) =>
  /^[A-Z0-9]{2,4}$/.test(team.abbr) &&
  team.players.length === PLAYERS &&
  team.players.every((player) => player.number <= 99 && printable(player.last))

const contains = (rom: Uint8Array, pattern: number[]) => {
  for (let i = rom.indexOf(pattern[0]); i !== -1; i = rom.indexOf(pattern[0], i + 1)) {
    if (pattern.every((byte, k) => rom[i + k] === byte)) return true
  }
  return false
}

export function scanTsb(rom: Uint8Array): RomScan {
  const mapper = (rom[6] >> 4) | (rom[7] & 0xf0)
  if (rom.length !== SIZE || rom[4] !== PRG_BANKS || rom[5] !== CHR_BANKS || mapper !== MMC3) return fail("it isn't a 32-team Tecmo Super Bowl ROM")
  let teams: RosterTeam[]
  try {
    teams = parseRoster(rom, TSB2026_ROSTER)
  } catch {
    return fail("its roster doesn't read as 32 teams")
  }
  if (teams.length !== TEAMS || !teams.every(readable)) return fail("its roster doesn't read as 32 teams")
  if (!ENGINE.every((pattern) => contains(rom, pattern))) return fail("its game code doesn't match")
  return { ok: true }
}

export const TSB_SCAN: RomScanner = {
  about: 'Unverified 32-team roster hack',
  note: 'Other 32-team roster hacks load as UNVERIFIED when they pass a compatibility scan.',
  check: scanTsb,
}
