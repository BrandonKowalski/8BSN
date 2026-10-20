import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { bootCore } from '../../../tools/headless'
import { TSB1991, TSB2026 } from '../game/roms'
import { parseRoster } from '../game/roster'
import { extractHelmets } from './extract'
import type { Rgba } from './cutout'

const romPath = 'Tecmo Super Bowl 2026.nes'
const originalPath = 'Tecmo Super Bowl (USA).nes'

const opaque = (h: { data: Uint8ClampedArray }) => {
  let n = 0
  for (let i = 3; i < h.data.length; i += 4) if (h.data[i] === 255) n++
  return n
}
const color = (h: { width: number; data: Uint8ClampedArray }, x: number, y: number) => {
  const i = (y * h.width + x) * 4
  return [h.data[i], h.data[i + 1], h.data[i + 2], h.data[i + 3]]
}
const flipped = (h: Rgba) => {
  const data = new Uint8ClampedArray(h.data.length)
  for (let y = 0; y < h.height; y++) for (let x = 0; x < h.width; x++) data.set(color(h, h.width - 1 - x, y), (y * h.width + x) * 4)
  return data.join(',')
}

test.skipIf(!existsSync(romPath))('every team gets its own helmet cut from the matchup screen with a transparent background', async () => {
  const rom = readFileSync(romPath)
  const ids = parseRoster(rom).map((t) => t.id)
  const helmets = extractHelmets(await bootCore(), rom, ids.map((id) => ({ id, logo: 'mirror' as const })))
  expect([...helmets.keys()].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b))
  for (const { right: helmet } of helmets.values()) {
    expect(helmet.width).toBeGreaterThan(50)
    expect(helmet.width).toBeLessThan(70)
    expect(helmet.height).toBeGreaterThan(45)
    expect(helmet.height).toBeLessThan(60)
    expect(color(helmet, 0, helmet.height - 1)[3]).toBe(0)
    expect(opaque(helmet) / (helmet.width * helmet.height)).toBeGreaterThan(0.5)
  }
  const signature = (id: number) => Array.from(helmets.get(id)!.right.data).join(',')
  expect(new Set(ids.map(signature)).size).toBeGreaterThan(25)
}, 60000)

test.skipIf(!existsSync(romPath))('left facing helmets mirror the shell and keep lettered logos readable', async () => {
  const rom = readFileSync(romPath)
  const teams = parseRoster(rom)
  const id = (abbr: string) => teams.find((t) => t.abbr === abbr)!.id
  const helmets = extractHelmets(await bootCore(), rom, [
    { id: id('KC'), logo: 'letters' },
    { id: id('DEN'), logo: 'mirror' as const },
  ])
  const kc = helmets.get(id('KC'))!
  const den = helmets.get(id('DEN'))!
  expect(flipped(den.right)).toBe(den.left.data.join(','))
  expect(flipped(kc.right)).not.toBe(kc.left.data.join(','))
  expect(opaque(kc.left)).toBe(opaque(kc.right))
}, 60000)

test.skipIf(!existsSync(originalPath))('the original game trademark is erased from both facings', async () => {
  const rom = readFileSync(originalPath)
  const teams = parseRoster(rom, TSB1991.roster)
  const id = teams.find((t) => t.abbr === 'BUF')!.id
  const { right, left } = extractHelmets(await bootCore(), rom, [{ id, logo: 'mirror' as const }], TSB1991.helmets).get(id)!
  const [mark] = TSB1991.helmets.erase[0]
  for (let y = mark.y; y < mark.y + mark.h; y++) {
    for (let x = mark.x; x < mark.x + mark.w; x++) {
      const inside = x >= right.x && x < right.x + right.width && y >= right.y && y < right.y + right.height
      if (inside) expect(color(right, x - right.x, y - right.y)[3]).toBe(0)
    }
  }
  expect(flipped(right)).toBe(left.data.join(','))
  expect(TSB2026.helmets.erase).toEqual([[], []])
}, 60000)
