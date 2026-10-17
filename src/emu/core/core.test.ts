import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import createCore from './tb_core.mjs'

const romPath = 'Tecmo Super Bowl 2026.nes'
test.skipIf(!existsSync(romPath))('core boots the ROM and produces frames, audio and memory', async () => {
  const core = await createCore()
  core._tb_init()
  const rom = readFileSync(romPath)
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  expect(core._tb_load_rom(ptr, rom.length)).toBe(1)
  let audio = 0
  const start = performance.now()
  for (let i = 0; i < 600; i++) { core._tb_run_frame(); audio += core._tb_audio_frames() }
  const msPerFrame = (performance.now() - start) / 600
  const video = core.HEAPU8.subarray(core._tb_video_ptr(), core._tb_video_ptr() + 256 * 240 * 4)
  expect(new Set(video).size).toBeGreaterThan(2)
  expect(audio / 600).toBeGreaterThan(core._tb_sample_rate() / 61)
  expect(audio / 600).toBeLessThan(core._tb_sample_rate() / 59)
  expect(core._tb_ram_size()).toBe(2048)
  expect(core._tb_sram_size()).toBe(8192)
  expect(msPerFrame).toBeLessThan(6)
})
