import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import createCore from './core/tb_core.mjs'
import type { CoreModule } from './core/types'
import { PACKAGES } from '../packages/registry'
import { anchorMatches } from './anchor'
import { Recorder, ramHash } from './recorder'
import { loadScript, mask } from '../../tools/headless'

const ROM = 'Tecmo Super Bowl 2026.nes'
const TAIL = 60
const ANCHOR = PACKAGES[0].clipAnchor ?? []

async function bootCore(rom: Uint8Array): Promise<CoreModule> {
  const core = await createCore()
  core._tb_init()
  core._tb_set_sprite_limit_removal(1)
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  if (core._tb_load_rom(ptr, rom.length) !== 1) throw new Error('ROM rejected by core')
  return core
}

const ramOf = (core: CoreModule) => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())

function saveState(core: CoreModule): Uint8Array | null {
  const size = core._tb_state_size()
  const ptr = core._malloc(size)
  try {
    return core._tb_save_state(ptr, size) === 1 ? core.HEAPU8.slice(ptr, ptr + size) : null
  } finally {
    core._free(ptr)
  }
}

function frameInputs(): [number, number][] {
  const steps = [...loadScript('packages/tsb/tools/scripts/to-preseason-kickoff.json'), ...['01', '02', '03', '04', '05', '06'].flatMap((n) => loadScript(`packages/tsb/tools/scripts/game-a-${n}.json`))]
  const out: [number, number][] = []
  for (const step of steps) {
    if (!('frames' in step)) continue
    const p1 = mask(step.p1)
    const p2 = mask(step.p2)
    for (let i = 0; i < step.frames; i++) out.push([p1, p2])
  }
  return out
}

test.skipIf(!existsSync(ROM))('a recorded play replays on a fresh core with every RAM hash matching', async () => {
  const rom = readFileSync(ROM)
  const live = await bootCore(rom)
  const recorder = new Recorder()
  const inputs = frameInputs()
  const stretches: { start: number; end: number }[] = []
  let wasLive = false
  for (let frame = 0; frame < inputs.length; frame++) {
    const [p1, p2] = inputs[frame]
    live._tb_set_input(0, p1)
    live._tb_set_input(1, p2)
    live._tb_run_frame()
    const ram = ramOf(live)
    const isNowLive = anchorMatches(ram, ANCHOR)
    recorder.frame(frame, p1, p2, ram, isNowLive, () => saveState(live))
    if (isNowLive && !wasLive) {
      stretches.push({ start: frame, end: frame })
    }
    if (isNowLive) stretches[stretches.length - 1].end = frame
    wasLive = isNowLive
  }

  expect(stretches.length).toBeGreaterThanOrEqual(3)

  const replay = await bootCore(rom)
  for (const stretch of stretches.slice(0, 3)) {
    const to = Math.min(stretch.end + TAIL, inputs.length - 1)
    const clip = recorder.clip(stretch.start, to)
    expect(clip).not.toBeNull()
    if (!clip) continue
    const state = replay._malloc(clip.state.length)
    replay.HEAPU8.set(clip.state, state)
    expect(replay._tb_load_state(state, clip.state.length)).toBe(1)
    replay._free(state)
    expect(ramHash(ramOf(replay))).toBe(clip.hashes[0])
    for (let k = 1; k <= clip.to - clip.from; k++) {
      replay._tb_set_input(0, clip.inputs[2 * k])
      replay._tb_set_input(1, clip.inputs[2 * k + 1])
      replay._tb_run_frame()
      const got = ramHash(ramOf(replay))
      if (got !== clip.hashes[k]) throw new Error(`diverged at frame ${clip.from + k} (stretch starting ${stretch.start}, step ${k})`)
    }
  }
}, 300000)
