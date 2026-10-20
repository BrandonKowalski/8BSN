import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { bootCore } from '../../../tools/headless'
import { parseRoster } from '../game/roster'
import { extractHelmets } from './extract'

const romPath = 'Tecmo Super Bowl 2026.nes'

const opaque = (h: { data: Uint8ClampedArray }) => {
  let n = 0
  for (let i = 3; i < h.data.length; i += 4) if (h.data[i] === 255) n++
  return n
}
const color = (h: { width: number; data: Uint8ClampedArray }, x: number, y: number) => {
  const i = (y * h.width + x) * 4
  return [h.data[i], h.data[i + 1], h.data[i + 2], h.data[i + 3]]
}

test.skipIf(!existsSync(romPath))('every team gets its own helmet cut from the matchup screen with a transparent background', async () => {
  const rom = readFileSync(romPath)
  const ids = parseRoster(rom).map((t) => t.id)
  const helmets = extractHelmets(await bootCore(), rom, ids)
  expect([...helmets.keys()].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b))
  for (const helmet of helmets.values()) {
    expect(helmet.width).toBeGreaterThan(50)
    expect(helmet.width).toBeLessThan(70)
    expect(helmet.height).toBeGreaterThan(45)
    expect(helmet.height).toBeLessThan(60)
    expect(color(helmet, 0, helmet.height - 1)[3]).toBe(0)
    expect(opaque(helmet) / (helmet.width * helmet.height)).toBeGreaterThan(0.5)
  }
  const signature = (id: number) => Array.from(helmets.get(id)!.data).join(',')
  expect(new Set(ids.map(signature)).size).toBeGreaterThan(25)
}, 60000)
