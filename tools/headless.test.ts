import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
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
