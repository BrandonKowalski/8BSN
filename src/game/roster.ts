export type RosterPlayer = { first: string; last: string; number: number; position: 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'K' | 'P' }
export type RosterTeam = { id: number; abbr: string; city: string; name: string; players: RosterPlayer[] }

const INES_HEADER = 0x10
const TEAM_POINTER_TABLE = 0x10
const TEAM_SLOTS = 34
const FIRST_ADDED_TEAM = 30
const ADDED_TEAM_NAME_OFFSET = 0x30010
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

function parsePlayers(rom: Uint8Array, id: number, table: number): RosterPlayer[] {
  const nameAt = (pointer: number) => (id >= FIRST_ADDED_TEAM ? pointer + ADDED_TEAM_NAME_OFFSET : bank0(pointer))
  return POSITIONS.map((position, index) => {
    const entry = nameAt(word(rom, table + index * 2))
    const start = entry + 1
    const end = nameAt(word(rom, table + index * 2 + 2))
    const raw = text(rom, start, end)
    const split = raw.search(/[A-Z]/)
    return { first: capitalize(raw.slice(0, split)), last: capitalize(raw.slice(split)), number: bcd(rom[entry]), position }
  })
}

export function parseRoster(rom: Uint8Array): RosterTeam[] {
  const teams: RosterTeam[] = []
  for (let id = 0; id < TEAM_SLOTS; id++) {
    const pointer = word(rom, TEAM_POINTER_TABLE + id * 2)
    if (pointer === 0xffff) continue
    teams.push({
      id,
      abbr: teamText(rom, id).replaceAll('.', ''),
      city: capitalize(teamText(rom, TEAM_SLOTS + id)),
      name: capitalize(teamText(rom, TEAM_SLOTS * 2 + id)),
      players: parsePlayers(rom, id, bank0(pointer)),
    })
  }
  return teams
}
