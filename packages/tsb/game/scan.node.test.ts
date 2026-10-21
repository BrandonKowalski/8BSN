import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { scanTsb } from './scan'

const ROM_2026 = 'Tecmo Super Bowl 2026.nes'
const ROM_1991 = 'Tecmo Super Bowl (USA).nes'
const read = (path: string) => new Uint8Array(readFileSync(path))

const replaceAll = (rom: Uint8Array, from: number[], to: number[]) => {
  for (let i = 0; i <= rom.length - from.length; i++) if (from.every((b, k) => rom[i + k] === b)) rom.set(to, i)
}

test('a 32-team header over noise has no readable roster', () => {
  const rom = new Uint8Array(16 + 16 * 16384 + 32 * 8192)
  for (let i = 0; i < rom.length; i++) rom[i] = (i * 7919 + 13) & 0xff
  rom.set([0x4e, 0x45, 0x53, 0x1a, 0x10, 0x20, 0x42, 0x00])
  expect(scanTsb(rom)).toEqual({ ok: false, reason: "its roster doesn't read as 32 teams" })
})

test('a ROM of the wrong size or mapper is not a 32-team game', () => {
  expect(scanTsb(new Uint8Array([0x4e, 0x45, 0x53, 0x1a, 0x10, 0x20, 0x42, 0x00]))).toEqual({ ok: false, reason: "it isn't a 32-team Tecmo Super Bowl ROM" })
})

test.skipIf(!existsSync(ROM_2026))('a 2026 hack with different bytes passes', () => {
  const rom = read(ROM_2026)
  rom[rom.length - 1] ^= 0xff
  expect(scanTsb(rom)).toEqual({ ok: true })
})

test.skipIf(!existsSync(ROM_2026))('a roster that reads as fewer than 32 teams fails', () => {
  const rom = read(ROM_2026)
  rom.set([0xff, 0xff], 0x10)
  expect(scanTsb(rom)).toEqual({ ok: false, reason: "its roster doesn't read as 32 teams" })
})

test.skipIf(!existsSync(ROM_2026))('game code that no longer writes the score fails', () => {
  const rom = read(ROM_2026)
  replaceAll(rom, [0x8d, 0x99, 0x03], [0xea, 0xea, 0xea])
  expect(scanTsb(rom)).toEqual({ ok: false, reason: "its game code doesn't match" })
})

test.skipIf(!existsSync(ROM_1991))('the 1991 original is not a 32-team game', () => {
  expect(scanTsb(read(ROM_1991))).toEqual({ ok: false, reason: "it isn't a 32-team Tecmo Super Bowl ROM" })
})
