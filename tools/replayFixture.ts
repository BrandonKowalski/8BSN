import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import createCore from '../src/emu/core/tb_core.mjs'
import type { CoreModule } from '../src/emu/core/types'
import { emptySnapshot, RAM_BYTES, SRAM_BYTES, type Snapshot } from '../src/emu/snapshot'
import { TSB2026_MAP } from '../src/game/maps/tsb2026'
import type { Addr, MemoryMap } from '../src/game/memoryMap'
import { loadScript, type Step } from './headless'

export type ReplayWindow = { name: string; from: number; to: number }
export type RecordedWindow = { name: string; from: number; ram: string; sram: string; changes: number[][] }
export type ReplayFixture = { windows: RecordedWindow[] }

const SRAM_FLAG = 0x10000
const STAT_BLOCK_BYTES = 261

const BUTTON_BITS: Record<string, number> = { B: 1, SELECT: 4, START: 8, UP: 16, DOWN: 32, LEFT: 64, RIGHT: 128, A: 256 }
const mask = (buttons: string[] = []) => buttons.reduce((m, b) => m | (BUTTON_BITS[b.toUpperCase()] ?? 0), 0)

export function trackedAddresses(map: MemoryMap): number[] {
  const out = new Set<number>()
  const add = (addr: Addr, length = 1) => {
    for (let i = 0; i < length; i++) out.add((addr.region === 'sram' ? SRAM_FLAG : 0) + addr.offset + i)
  }
  for (const addr of [map.gameStatus, map.playStatus, map.quarter, map.down, map.clockSeconds, map.clockMinutes, map.offense, map.screenMode]) add(addr)
  for (const addr of map.controlled) add(addr, 2)
  for (const addr of [...map.teamIds, ...map.scores, ...map.timeouts]) add(addr)
  add(map.losX, 2)
  add(map.firstDownX, 2)
  for (let slot = 0; slot < map.players.count; slot++) {
    const at = map.players.base.offset + slot * map.players.stride
    out.add(at + map.players.x)
    out.add(at + map.players.x + 1)
    out.add(at + map.players.y)
  }
  for (const block of map.statBlocks) add(block, STAT_BLOCK_BYTES)
  return [...out].sort((a, b) => a - b)
}

const read = (ram: Uint8Array, sram: Uint8Array, code: number) => (code & SRAM_FLAG ? sram[code - SRAM_FLAG] : ram[code])

export function recordWindows(core: CoreModule, rom: Uint8Array, script: Step[], windows: ReplayWindow[], map: MemoryMap = TSB2026_MAP): ReplayFixture {
  core._tb_init()
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  if (core._tb_load_rom(ptr, rom.length) !== 1) throw new Error('ROM rejected by core')
  const tracked = trackedAddresses(map)
  const last = Math.max(...windows.map((w) => w.to))
  const recorded = new Map<string, { window: RecordedWindow; prev: Uint8Array }>()
  let frame = 0
  for (const step of script) {
    if (!('frames' in step)) continue
    core._tb_set_input(0, mask(step.p1))
    core._tb_set_input(1, mask(step.p2))
    for (let i = 0; i < step.frames && frame < last; i++) {
      core._tb_run_frame()
      frame++
      const ram = core.HEAPU8.subarray(core._tb_ram_ptr(), core._tb_ram_ptr() + RAM_BYTES)
      const sram = core.HEAPU8.subarray(core._tb_sram_ptr(), core._tb_sram_ptr() + SRAM_BYTES)
      for (const w of windows) {
        if (frame < w.from || frame > w.to) continue
        const values = Uint8Array.from(tracked, (code) => read(ram, sram, code))
        const entry = recorded.get(w.name)
        if (!entry) {
          const window: RecordedWindow = {
            name: w.name,
            from: frame,
            ram: Buffer.from(ram).toString('base64'),
            sram: Buffer.from(sram).toString('base64'),
            changes: [],
          }
          recorded.set(w.name, { window, prev: values })
          continue
        }
        const change: number[] = []
        values.forEach((value, i) => {
          if (value !== entry.prev[i]) change.push(tracked[i], value)
        })
        entry.window.changes.push(change)
        entry.prev = values
      }
    }
    if (frame >= last) break
  }
  return { windows: windows.map((w) => recorded.get(w.name)?.window).filter((w): w is RecordedWindow => !!w) }
}

export function loadReplayFixture(path: string): ReplayFixture {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as ReplayFixture
}

export function* replaySnapshots(fixture: ReplayFixture, name: string): Generator<Snapshot> {
  const window = fixture.windows.find((w) => w.name === name)
  if (!window) throw new Error(`No replay window ${name}`)
  const snap = emptySnapshot()
  snap.ram.set(Buffer.from(window.ram, 'base64'))
  snap.sram.set(Buffer.from(window.sram, 'base64'))
  snap.frame = window.from
  yield snap
  for (const change of window.changes) {
    for (let i = 0; i < change.length; i += 2) {
      const code = change[i]
      if (code & SRAM_FLAG) snap.sram[code - SRAM_FLAG] = change[i + 1]
      else snap.ram[code] = change[i + 1]
    }
    snap.frame += 1
    yield snap
  }
}

export const GAME_A_WINDOWS: ReplayWindow[] = [
  { name: 'kickoff', from: 2300, to: 3600 },
  { name: 'punt', from: 4100, to: 5520 },
  { name: 'touchdown', from: 11150, to: 12760 },
  { name: 'quarter', from: 17000, to: 17520 },
  { name: 'fumble', from: 18300, to: 19200 },
  { name: 'sack', from: 23300, to: 23800 },
  { name: 'interception', from: 26850, to: 27400 },
  { name: 'halftime', from: 29280, to: 29960 },
]

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? undefined : process.argv[index + 1]
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const core = await createCore()
  const fixture = recordWindows(core, readFileSync(arg('rom')), loadScript(arg('script')), GAME_A_WINDOWS)
  writeFileSync(arg('out'), gzipSync(JSON.stringify(fixture)))
}
