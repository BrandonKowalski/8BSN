import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { rosterOf, TSB1991 } from './roms'
import { parseRoster } from './roster'

const romPath = 'Tecmo Super Bowl 2026.nes'
const hasRom = existsSync(romPath)
const originalPath = 'Tecmo Super Bowl (USA).nes'
const hasOriginal = existsSync(originalPath)
const original = () => rosterOf({ bytes: new Uint8Array(readFileSync(originalPath)), rom: TSB1991 })
const STAT_BLOCK_ORDER = [
  'QB', 'QB', 'RB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE',
  'OL', 'OL', 'OL', 'OL', 'OL',
  'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'LB', 'DB', 'DB', 'DB', 'DB',
  'K', 'P',
]

test.skipIf(!hasRom)('parseRoster finds every team with 30 players in stat block order', () => {
  const teams = parseRoster(new Uint8Array(readFileSync(romPath)))
  expect(teams.length).toBeGreaterThanOrEqual(28)
  for (const team of teams) {
    expect(team.players.map((p) => p.position)).toEqual(STAT_BLOCK_ORDER)
  }
})

test.skipIf(!hasRom)('parseRoster normalizes names and reads abbreviations', () => {
  const teams = parseRoster(new Uint8Array(readFileSync(romPath)))
  const bills = teams.find((t) => t.players.some((p) => p.first === 'Josh' && p.last === 'Allen'))
  expect(bills?.abbr).toBe('BUF')
  expect(bills).toMatchObject({ id: 0, city: 'Buffalo', name: 'Bills' })
  expect(bills?.players).toContainEqual(expect.objectContaining({ first: 'T.J.', last: 'Sanders', position: 'DL' }))
})

test.skipIf(!hasRom)('parseRoster uses in-game team ids, including the four added teams', () => {
  const teams = parseRoster(new Uint8Array(readFileSync(romPath)))
  const byAbbr = Object.fromEntries(teams.map((t) => [t.abbr, t.id]))
  expect(byAbbr).toMatchObject({ BUF: 0, CLE: 5, KC: 13, DAL: 19, SF: 30, ARZ: 33 })
  expect(teams.find((t) => t.id === 30)?.players[0]).toMatchObject({ first: 'Brock', last: 'Purdy', position: 'QB' })
})

test.skipIf(!hasRom)('every player carries the jersey number stored before the name', () => {
  const teams = parseRoster(new Uint8Array(readFileSync(romPath)))
  for (const team of teams) {
    for (const player of team.players) {
      expect(Number.isInteger(player.number)).toBe(true)
      expect(player.number).toBeGreaterThanOrEqual(0)
      expect(player.number).toBeLessThanOrEqual(99)
    }
  }
  expect(new Set(teams[0].players.map((p) => p.number)).size).toBeGreaterThanOrEqual(25)
})

test.skipIf(!hasOriginal)('the original ROM has 28 teams with their own cities and nicknames', () => {
  const teams = original()
  expect(teams).toHaveLength(28)
  for (const team of teams) expect(team.players.map((p) => p.position)).toEqual(STAT_BLOCK_ORDER)
  expect(teams[0]).toMatchObject({ id: 0, abbr: 'BUF', city: 'Buffalo', name: 'Bills' })
  expect(teams[6]).toMatchObject({ id: 6, abbr: 'CLE', city: 'Cleveland', name: 'Browns' })
  expect(teams[27]).toMatchObject({ id: 27, abbr: 'ATL', city: 'Atlanta', name: 'Falcons' })
})

test.skipIf(!hasOriginal)('the original ROM gets the real names the NFLPA kept out', () => {
  const byAbbr = Object.fromEntries(original().map((t) => [t.abbr, t.players]))
  expect(byAbbr.BUF[0]).toMatchObject({ first: 'Jim', last: 'Kelly', number: 12, position: 'QB' })
  expect(byAbbr.CLE[0]).toMatchObject({ first: 'Bernie', last: 'Kosar', number: 19, position: 'QB' })
  expect(byAbbr.PHI[0]).toMatchObject({ first: 'Randall', last: 'Cunningham', number: 12, position: 'QB' })
  expect(byAbbr.BUF[23]).toMatchObject({ first: 'Cornelius', last: 'Bennett', number: 97 })
  expect(byAbbr.JETS[0]).toMatchObject({ first: 'Ken', last: "O'Brien", number: 7 })
})
