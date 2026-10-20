import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadScript } from '../../../tools/headless'
import createCore from './tb_core.mjs'

const romPath = 'Tecmo Super Bowl 2026.nes'
const BUTTONS: Record<string, number> = { B: 1, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128, A: 256 }

test.skipIf(!existsSync(romPath))('the PPU dump holds video memory, palette, sprites and registers that match the screen', { timeout: 30_000 }, async () => {
  const core = await createCore()
  core._tb_init()
  const rom = readFileSync(romPath)
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  expect(core._tb_load_rom(ptr, rom.length)).toBe(1)
  let frame = 0
  for (const step of loadScript('packages/tsb/tools/scripts/to-preseason-kickoff.json')) {
    if (!('frames' in step) || 'trace' in step) continue
    const mask = (b: string[] = []) => b.reduce((m, x) => m | BUTTONS[x], 0)
    core._tb_set_input(0, mask(step.p1))
    core._tb_set_input(1, mask(step.p2))
    for (let i = 0; i < step.frames && frame < 1260; i++, frame++) core._tb_run_frame()
  }
  expect(core._tb_ppu_dump()).toBe(0x4105)
  const dump = core.HEAPU8.slice(core._tb_ppu_ptr(), core._tb_ppu_ptr() + 0x4105)
  expect(new Set(dump.subarray(0, 0x2000)).size).toBeGreaterThan(2)
  expect(new Set(dump.subarray(0x2000, 0x2400)).size).toBeGreaterThan(2)
  expect(dump[0x3f00]).toBeLessThan(0x40)
  const sprites = dump.subarray(0x4000, 0x4100)
  expect(Array.from({ length: 64 }, (_, i) => sprites[i * 4]).some((y) => y < 0xef)).toBe(true)
})
