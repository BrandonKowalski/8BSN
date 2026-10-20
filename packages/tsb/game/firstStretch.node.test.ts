import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { anchorMatches } from '@8bsn/sdk/testing'
import { bootCore, loadScript, mask, RAM_BYTES, SRAM_BYTES } from '../../../tools/headless'
import { decodeGameState } from './decode'
import { TSB_ANCHOR, TSB2026_MAP } from './maps/tsb2026'

const ROM = 'Tecmo Super Bowl 2026.nes'

test.skipIf(!existsSync(ROM))('the first anchored stretch of a scripted game is a kickoff', async () => {
  const core = await bootCore(readFileSync(ROM))
  const ramOf = () => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  const sramOf = () => core.HEAPU8.subarray(core._tb_sram_ptr(), core._tb_sram_ptr() + core._tb_sram_size())
  const steps = [...loadScript('packages/tsb/tools/scripts/to-preseason-kickoff.json'), ...loadScript('packages/tsb/tools/scripts/game-a-01.json')]
  let frame = 0
  for (const step of steps) {
    if (!('frames' in step)) continue
    core._tb_set_input(0, mask(step.p1))
    core._tb_set_input(1, mask(step.p2))
    for (let i = 0; i < step.frames; i++, frame++) {
      core._tb_run_frame()
      if (!anchorMatches(ramOf(), TSB_ANCHOR)) continue
      const snap = { ram: ramOf().slice(0, RAM_BYTES), sram: sramOf().slice(0, SRAM_BYTES), frame }
      expect(decodeGameState(snap, TSB2026_MAP, []).playKind).toBe('kickoff')
      return
    }
  }
  throw new Error('no anchored stretch')
}, 300000)
