import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import createCore from '../emu/core/tb_core.mjs'
import { VISIBLE_TOP } from '../emu/presenter'
import { loadScript, mask } from '../../tools/headless'
import { FEET_PX, fieldToScreen, fieldToScreenBody, fieldToScreenFeet } from './camera'
import { TSB2026_MAP } from './maps/tsb2026'

const ROM = 'Tecmo Super Bowl 2026.nes'
const FRAMES = [3200, 3250, 3420]
const CUTSCENE = 3330

test.skipIf(!existsSync(ROM))('the ball carrier projects onto the sprite drawn under it, its feet onto the sprite bottom, its body middle halfway down the body, and the pass cutscene projects nothing', async () => {
  const core = await createCore()
  core._tb_init()
  const rom = readFileSync(ROM)
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  expect(core._tb_load_rom(ptr, rom.length)).toBe(1)
  const steps = [...loadScript('tools/scripts/to-preseason-kickoff.json'), ...loadScript('tools/scripts/game-a-01.json'), ...loadScript('tools/scripts/game-a-02.json'), ...loadScript('tools/scripts/game-a-03.json')]
  const ramOf = () => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  const distances: number[] = []
  const feet: number[] = []
  const middle: number[] = []
  let cutscene: unknown
  let frame = 0
  for (const step of steps) {
    if (!('frames' in step) || frame > FRAMES[FRAMES.length - 1]) continue
    core._tb_set_input(0, mask(step.p1))
    core._tb_set_input(1, mask(step.p2))
    for (let i = 0; i < step.frames; i++) {
      const before = ramOf().slice()
      core._tb_run_frame()
      frame++
      if (frame === CUTSCENE) {
        expect(before[0x71] & 0x84).toBe(0x04)
        cutscene = fieldToScreen(before, TSB2026_MAP, { x: 0x800, y: 0x60 })
      }
      if (!FRAMES.includes(frame)) continue
      expect(before[0x71] & 0x84).toBe(0x04)
      const pointer = TSB2026_MAP.controlled[before[0x70] & 0x40 ? 1 : 0].offset
      const slot = before[pointer] | (before[pointer + 1] << 8)
      const x = before[slot + TSB2026_MAP.players.x] | (before[slot + TSB2026_MAP.players.x + 1] << 8)
      const at = fieldToScreen(before, TSB2026_MAP, { x, y: before[slot + TSB2026_MAP.players.y] })
      expect(at).not.toBeNull()
      core._tb_ppu_dump()
      const oam = core.HEAPU8.slice(core._tb_ppu_ptr() + 0x4000, core._tb_ppu_ptr() + 0x4100)
      const sprites = Array.from({ length: 64 }, (_, k) => ({ x: oam[k * 4 + 3] + 4, y: oam[k * 4] + 1 - VISIBLE_TOP })).filter((s) => s.y < 0xef - VISIBLE_TOP)
      distances.push(Math.min(...sprites.map((s) => Math.max(Math.abs(s.x - at!.x), Math.abs(s.y - at!.y)))))
      const chr = core.HEAPU8.slice(core._tb_ppu_ptr(), core._tb_ppu_ptr() + 0x2000)
      expect(core.HEAPU8[core._tb_ppu_ptr() + 0x4100] & 0x20).toBe(0x20)
      let bottom = -Infinity
      let upper = Infinity
      for (let k = 0; k < 64; k++) {
        const top = oam[k * 4] + 1 - VISIBLE_TOP
        const left = oam[k * 4 + 3]
        if (top !== at!.y || (left !== at!.x && left !== at!.x - 8)) continue
        const tile = oam[k * 4 + 1]
        for (let r = 0; r < 16; r++) {
          const base = ((tile & 1) << 12) | (((tile & 0xfe) + (r >> 3)) << 4)
          const row = oam[k * 4 + 2] & 0x80 ? 15 - r : r
          if (!(chr[base + (r & 7)] | chr[base + 8 + (r & 7)])) continue
          bottom = Math.max(bottom, top + row + 1)
          upper = Math.min(upper, top + row)
        }
      }
      const point = { x, y: before[slot + TSB2026_MAP.players.y] }
      feet.push(bottom - fieldToScreenFeet(before, TSB2026_MAP, point)!.y)
      middle.push((upper + bottom) / 2 - fieldToScreenBody(before, TSB2026_MAP, point)!.y)
    }
  }
  expect(cutscene).toBeNull()
  expect(distances).toHaveLength(3)
  for (const d of distances) expect(d).toBeLessThanOrEqual(8)
  expect(feet).toEqual([0, 0, 0])
  expect(middle).toEqual([0, 0, 0])
}, 60000)

test('a map without a camera projects nothing', () => {
  expect(fieldToScreen(new Uint8Array(0x800), { ...TSB2026_MAP, cameraX: null }, { x: 0x800, y: 0x60 })).toBeNull()
})

test('field points move left by the camera and up by the cropped lines', () => {
  const ram = new Uint8Array(0x800)
  ram[0x0f] = 0x16
  ram[0x54] = 0xc7
  ram[0x55] = 0x06
  expect(fieldToScreen(ram, TSB2026_MAP, { x: 0x74f, y: 0x68 })).toEqual({ x: 0x88, y: 0x68 + 1 - VISIBLE_TOP })
})

test('a cutscene or any screen other than the field projects nothing', () => {
  const ram = new Uint8Array(0x800)
  ram[0x54] = 0xc7
  ram[0x55] = 0x06
  for (const mode of [0x17, 0x80, 0x13, 0x00]) {
    ram[0x0f] = mode
    expect(fieldToScreen(ram, TSB2026_MAP, { x: 0x74f, y: 0x68 })).toBeNull()
  }
})

test('the feet sit one sprite height below the body top and the middle half way down', () => {
  const ram = new Uint8Array(0x800)
  ram[0x0f] = 0x16
  ram[0x54] = 0xc7
  ram[0x55] = 0x06
  expect(FEET_PX).toBe(16)
  expect(fieldToScreenBody(ram, TSB2026_MAP, { x: 0x74f, y: 0x68 })).toEqual({ x: 0x88, y: 0x68 + 1 - VISIBLE_TOP + 8 })
  expect(fieldToScreenFeet(ram, TSB2026_MAP, { x: 0x74f, y: 0x68 })).toEqual({ x: 0x88, y: 0x68 + 1 - VISIBLE_TOP + 16 })
  ram[0x0f] = 0x17
  expect(fieldToScreenFeet(ram, TSB2026_MAP, { x: 0x74f, y: 0x68 })).toBeNull()
})
