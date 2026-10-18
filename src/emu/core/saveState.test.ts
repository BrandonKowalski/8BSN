import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import createCore from './tb_core.mjs'

const romPath = 'Tecmo Super Bowl 2026.nes'
test.skipIf(!existsSync(romPath))('loading a saved state replays the same frames', { timeout: 30_000 }, async () => {
  const core = await createCore()
  core._tb_init()
  const rom = readFileSync(romPath)
  const romPtr = core._malloc(rom.length)
  core.HEAPU8.set(rom, romPtr)
  expect(core._tb_load_rom(romPtr, rom.length)).toBe(1)
  const ram = () => core.HEAPU8.slice(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  const run = (frames: number) => {
    for (let i = 0; i < frames; i++) core._tb_run_frame()
  }
  run(400)
  const size = core._tb_state_size()
  expect(size).toBeGreaterThan(0)
  const statePtr = core._malloc(size)
  expect(core._tb_save_state(statePtr, size)).toBe(1)
  const saved = core.HEAPU8.slice(statePtr, statePtr + size)
  run(200)
  const expected = ram()
  run(300)
  expect(ram()).not.toEqual(expected)
  core.HEAPU8.set(saved, statePtr)
  expect(core._tb_load_state(statePtr, size)).toBe(1)
  run(200)
  expect(ram()).toEqual(expected)
})
