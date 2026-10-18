import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { parseRoster } from './roster'

const romPath = 'Tecmo Super Bowl 2026.nes'
const hasRom = existsSync(romPath)
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
