import type { CoreModule } from '../emu/core/types'
import { cutOut, type Rect, type Rgba } from './cutout'

const MENU_INPUTS: [number, number, number][] = [
  [300, 0, 0], [5, 8, 0], [120, 0, 0], [5, 8, 0], [90, 0, 0], [5, 256, 0], [90, 0, 0], [5, 256, 0], [90, 0, 0], [5, 32, 0],
  [30, 0, 0], [5, 256, 0], [60, 0, 0], [5, 256, 0], [45, 0, 0], [5, 0, 128], [20, 0, 0], [5, 0, 256], [120, 0, 0], [5, 256, 0], [35, 0, 0],
]
const SETTLE_FRAMES = 100
const TEAM_ID_ADDRS: [number, number] = [0x6c, 0x6d]
const FRAME_WIDTH = 256
const FRAME_BYTES = FRAME_WIDTH * 240 * 4
const HELMET_RECTS: [Rect, Rect] = [
  { x: 16, y: 8, w: 112, h: 70 },
  { x: 16, y: 116, w: 112, h: 70 },
]

function run(core: CoreModule, frames: number, p1 = 0, p2 = 0) {
  core._tb_set_input(0, p1)
  core._tb_set_input(1, p2)
  for (let i = 0; i < frames; i++) core._tb_run_frame()
}

export function extractHelmets(core: CoreModule, rom: Uint8Array, teamIds: number[]): Map<number, Rgba> {
  const helmets = new Map<number, Rgba>()
  if (teamIds.length === 0) return helmets
  core._tb_init()
  const romPtr = core._malloc(rom.length)
  core.HEAPU8.set(rom, romPtr)
  if (core._tb_load_rom(romPtr, rom.length) !== 1) return helmets
  for (const [frames, p1, p2] of MENU_INPUTS) run(core, frames, p1, p2)
  const size = core._tb_state_size()
  const statePtr = core._malloc(size)
  if (core._tb_save_state(statePtr, size) !== 1) return helmets
  const ram = () => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  for (let i = 0; i < teamIds.length; i += 2) {
    const pair: [number, number] = [teamIds[i], teamIds[i + 1] ?? teamIds[0]]
    core._tb_load_state(statePtr, size)
    ram()[TEAM_ID_ADDRS[0]] = pair[0]
    ram()[TEAM_ID_ADDRS[1]] = pair[1]
    run(core, SETTLE_FRAMES)
    const frame = core.HEAPU8.slice(core._tb_video_ptr(), core._tb_video_ptr() + FRAME_BYTES)
    pair.forEach((id, slot) => {
      const helmet = cutOut(frame, FRAME_WIDTH, HELMET_RECTS[slot])
      if (helmet && !helmets.has(id)) helmets.set(id, helmet)
    })
  }
  core._free(statePtr)
  core._free(romPtr)
  return helmets
}
