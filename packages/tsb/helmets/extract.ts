import type { CoreModule } from '@8bsn/sdk'
import { cutOut, type Rect } from './cutout'
import { faceLeft, type Facing, type Logo } from './mirror'

const MENU_INPUTS: [number, number, number][] = [
  [300, 0, 0], [5, 8, 0], [120, 0, 0], [5, 8, 0], [90, 0, 0], [5, 256, 0], [90, 0, 0], [5, 256, 0], [90, 0, 0], [5, 32, 0],
  [30, 0, 0], [5, 256, 0], [60, 0, 0], [5, 256, 0], [45, 0, 0], [5, 0, 128], [20, 0, 0], [5, 0, 256], [120, 0, 0], [5, 256, 0], [35, 0, 0],
]
const SETTLE_FRAMES = 100
const BARE_FRAMES = 3
const OAM = 0x200
const HIDDEN_Y = 0xf0
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

export type HelmetTeam = { id: number; logo: Logo }
export type HelmetErase = readonly [readonly Rect[], readonly Rect[]]
export type HelmetArt = { erase: HelmetErase; shine: readonly number[] }

const PLAIN: HelmetArt = { erase: [[], []], shine: [] }

export function extractHelmets(core: CoreModule, rom: Uint8Array, teams: HelmetTeam[], { erase, shine }: HelmetArt = PLAIN): Map<number, Facing> {
  const helmets = new Map<number, Facing>()
  if (teams.length === 0) return helmets
  const romPtr = core._malloc(rom.length)
  core.HEAPU8.set(rom, romPtr)
  if (core._tb_load_rom(romPtr, rom.length) !== 1) return helmets
  for (const [frames, p1, p2] of MENU_INPUTS) run(core, frames, p1, p2)
  const size = core._tb_state_size()
  const statePtr = core._malloc(size)
  if (core._tb_save_state(statePtr, size) !== 1) return helmets
  const ram = () => core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + core._tb_ram_size())
  const shot = () => core.HEAPU8.slice(core._tb_video_ptr(), core._tb_video_ptr() + FRAME_BYTES)
  for (let i = 0; i < teams.length; i += 2) {
    const pair: [HelmetTeam, HelmetTeam] = [teams[i], teams[i + 1] ?? teams[0]]
    core._tb_load_state(statePtr, size)
    ram()[TEAM_ID_ADDRS[0]] = pair[0].id
    ram()[TEAM_ID_ADDRS[1]] = pair[1].id
    run(core, SETTLE_FRAMES)
    const frame = shot()
    for (let sprite = OAM; sprite < OAM + 256; sprite += 4) if (ram()[sprite + 2] & 1) ram()[sprite] = HIDDEN_Y
    run(core, BARE_FRAMES)
    const bare = shot()
    for (const rect of erase.flat()) {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        frame.fill(0, (y * FRAME_WIDTH + rect.x) * 4, (y * FRAME_WIDTH + rect.x + rect.w) * 4)
        bare.fill(0, (y * FRAME_WIDTH + rect.x) * 4, (y * FRAME_WIDTH + rect.x + rect.w) * 4)
      }
    }
    pair.forEach((team, slot) => {
      const right = cutOut(frame, FRAME_WIDTH, HELMET_RECTS[slot])
      if (!right || helmets.has(team.id)) return
      helmets.set(team.id, { right, left: faceLeft(right, frame, bare, FRAME_WIDTH, team.logo, shine) })
    })
  }
  core._free(statePtr)
  core._free(romPtr)
  return helmets
}
