import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import createCore from '../src/emu/core/tb_core.mjs'
import { runScript } from './headless'

const romPath = 'Tecmo Super Bowl 2026.nes'
test.skipIf(!existsSync(romPath))('runScript dumps screenshots, memory and traces', async () => {
  const core = await createCore()
  const outDir = mkdtempSync(join(tmpdir(), 'headless-'))
  runScript(core, readFileSync(romPath), [{ frames: 120 }, { dump: 'boot' }, { trace: 't', frames: 3, ram: [0x30] }], outDir)
  expect(existsSync(join(outDir, 'boot.png'))).toBe(true)
  expect(statSync(join(outDir, 'boot.ram')).size).toBe(2048)
  expect(statSync(join(outDir, 'boot.sram')).size).toBe(8192)
  const lines = readFileSync(join(outDir, 't.csv'), 'utf8').trim().split('\n')
  expect(lines).toHaveLength(4)
  expect(lines[0]).toBe('frame,ram_0030')
})

test.skipIf(!existsSync(romPath))('trace steps hold the given buttons on each pad', async () => {
  const core = await createCore()
  const outDir = mkdtempSync(join(tmpdir(), 'headless-'))
  runScript(core, readFileSync(romPath), [{ frames: 120 }, { trace: 't', frames: 3, ram: [0x35, 0x36], p1: ['START'], p2: ['A'] }], outDir)
  const lines = readFileSync(join(outDir, 't.csv'), 'utf8').trim().split('\n')
  expect(lines.at(-1)).toBe('2,16,128')
})

test.skipIf(!existsSync(romPath))('state steps resume from a saved state file', async () => {
  const rom = readFileSync(romPath)
  const outDir = mkdtempSync(join(tmpdir(), 'headless-'))
  const source = await createCore()
  runScript(source, rom, [{ frames: 400 }], outDir)
  const size = source._tb_state_size()
  const at = source._malloc(size)
  source._tb_save_state(at, size)
  writeFileSync(join(outDir, 'slot.state'), source.HEAPU8.slice(at, at + size))
  runScript(source, rom, [{ state: join(outDir, 'slot.state') }, { frames: 100 }, { dump: 'expected' }], outDir)
  runScript(await createCore(), rom, [{ frames: 10 }, { state: join(outDir, 'slot.state') }, { frames: 100 }, { dump: 'actual' }], outDir)
  expect(readFileSync(join(outDir, 'actual.ram'))).toEqual(readFileSync(join(outDir, 'expected.ram')))
})
