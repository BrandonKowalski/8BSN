import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { loadScript, runScript, type Step } from '../../../tools/headless'
import createCore from './tb_core.mjs'
import type { CoreModule } from './types'

const romPath = 'Tecmo Super Bowl 2026.nes'
const FRAMES_INTO_SECOND_PLAY = 2888

function firstFrames(steps: Step[], total: number): Step[] {
  const out: Step[] = []
  let left = total
  for (const step of steps) {
    if (!('frames' in step)) continue
    if (left <= 0) break
    out.push({ ...step, frames: Math.min(step.frames, left) })
    left -= step.frames
  }
  return out
}

function frameIntoSecondPlay(core: CoreModule): Uint8Array {
  const steps = ['to-preseason-kickoff.json', 'game-a-01.json', 'game-a-02.json'].flatMap((name) => loadScript(join('packages/tsb/tools/scripts', name)))
  runScript(core, readFileSync(romPath), firstFrames(steps, FRAMES_INTO_SECOND_PLAY), mkdtempSync(join(tmpdir(), 'sprites-')))
  const ptr = core._tb_video_ptr()
  return core.HEAPU8.slice(ptr, ptr + 256 * 240 * 4)
}

test.skipIf(!existsSync(romPath))('the core draws sprites beyond the eight per scanline hardware limit by default', async () => {
  const byDefault = frameIntoSecondPlay(await createCore())
  const limitedCore = await createCore()
  limitedCore._tb_set_sprite_limit_removal(0)
  const limited = frameIntoSecondPlay(limitedCore)
  let extraPixels = 0
  for (let i = 0; i < byDefault.length; i += 4) {
    if (byDefault[i] !== limited[i] || byDefault[i + 1] !== limited[i + 1] || byDefault[i + 2] !== limited[i + 2]) extraPixels++
  }
  expect(extraPixels).toBeGreaterThan(100)
}, 60000)
