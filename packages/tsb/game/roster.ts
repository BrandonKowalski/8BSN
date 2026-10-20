export type RosterPlayer = { first: string; last: string; number: number; position: 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'K' | 'P' }
export type RosterTeam = { id: number; abbr: string; city: string; name: string; players: RosterPlayer[] }
export type RosterLayout = { teams: number; textStride: number; addedTeams: { first: number; nameOffset: number } | null }
export type PlayerFix = { team: string; slot: number; first: string; last: string; number?: number }

export const TSB2026_ROSTER: RosterLayout = { teams: 34, textStride: 34, addedTeams: { first: 30, nameOffset: 0x30010 } }
export const TSB1991_ROSTER: RosterLayout = { teams: 28, textStride: 32, addedTeams: null }

const INES_HEADER = 0x10
const TEAM_POINTER_TABLE = 0x10
const TEAM_TEXT_POINTERS = 0x1fc10
const TEAM_TEXT_OFFSET = 0x14010

const POSITIONS: RosterPlayer['position'][] = [
  'QB', 'QB', 'RB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE',
  'OL', 'OL', 'OL', 'OL', 'OL',
  'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'LB', 'DB', 'DB', 'DB', 'DB',
  'K', 'P',
]

function word(rom: Uint8Array, at: number): number {
  return rom[at] | (rom[at + 1] << 8)
}

function bcd(value: number): number {
  return (value >> 4) * 10 + (value & 0xf)
}

function bank0(pointer: number): number {
  return pointer - 0x8000 + INES_HEADER
}

function text(rom: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...rom.subarray(start, end))
}

function capitalize(value: string): string {
  return value.toLowerCase().replace(/(^|[^a-z0-9])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
}

function teamText(rom: Uint8Array, index: number): string {
  const at = TEAM_TEXT_POINTERS + index * 2
  return text(rom, word(rom, at) + TEAM_TEXT_OFFSET, word(rom, at + 2) + TEAM_TEXT_OFFSET)
}

function parsePlayers(rom: Uint8Array, id: number, table: number, layout: RosterLayout): RosterPlayer[] {
  const added = layout.addedTeams
  const nameAt = (pointer: number) => (added && id >= added.first ? pointer + added.nameOffset : bank0(pointer))
  return POSITIONS.map((position, index) => {
    const entry = nameAt(word(rom, table + index * 2))
    const start = entry + 1
    const end = nameAt(word(rom, table + index * 2 + 2))
    const raw = text(rom, start, end)
    const split = raw.search(/[A-Z]/)
    return { first: capitalize(raw.slice(0, split)), last: capitalize(raw.slice(split)), number: bcd(rom[entry]), position }
  })
}

function applyFixes(team: RosterTeam, fixes: PlayerFix[]): RosterTeam {
  const players = [...team.players]
  for (const fix of fixes) {
    if (fix.team !== team.abbr || !players[fix.slot]) continue
    const { first, last, number = players[fix.slot].number } = fix
    players[fix.slot] = { ...players[fix.slot], first, last, number }
  }
  return { ...team, players }
}

export function parseRoster(rom: Uint8Array, layout: RosterLayout = TSB2026_ROSTER, fixes: PlayerFix[] = []): RosterTeam[] {
  const teams: RosterTeam[] = []
  for (let id = 0; id < layout.teams; id++) {
    const pointer = word(rom, TEAM_POINTER_TABLE + id * 2)
    if (pointer === 0xffff) continue
    const team = {
      id,
      abbr: teamText(rom, id).replaceAll('.', ''),
      city: capitalize(teamText(rom, layout.textStride + id)),
      name: capitalize(teamText(rom, layout.textStride * 2 + id)),
      players: parsePlayers(rom, id, bank0(pointer), layout),
    }
    teams.push(applyFixes(team, fixes))
  }
  return teams
}
