import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { CoreModule } from './core/types'
import { createShared } from './shared'
import { emptySnapshot, readSnapshot } from './snapshot'
import type { WorkerReply, WorkerRequest } from './emu.worker'

const RAM = 0x1000
const SRAM = 0x2000
const VIDEO = 0x10000
const AUDIO = 0x80000

function fakeCore(): CoreModule {
  const heap = new Uint8Array(1 << 21)
  let next = 0x100000
  return {
    _tb_init: () => {},
    _tb_load_rom: () => 1,
    _tb_set_input: () => {},
    _tb_set_sprite_limit_removal: () => {},
    _tb_run_frame: () => {
      heap.fill(0xaa, RAM, RAM + 2048)
      heap.fill(0xbb, SRAM, SRAM + 8192)
    },
    _tb_video_ptr: () => VIDEO,
    _tb_audio_ptr: () => AUDIO,
    _tb_audio_frames: () => 0,
    _tb_sample_rate: () => 48000,
    _tb_fps: () => 60,
    _tb_ram_ptr: () => RAM,
    _tb_ram_size: () => 2048,
    _tb_sram_ptr: () => SRAM,
    _tb_sram_size: () => 8192,
    _tb_state_size: () => 16,
    _tb_save_state: () => 1,
    _tb_load_state: (ptr: number) => {
      heap.fill(heap[ptr], RAM, RAM + 2048)
      heap.fill(heap[ptr + 1], SRAM, SRAM + 8192)
      return 1
    },
    _tb_ppu_ptr: () => 0,
    _tb_ppu_dump: () => 0,
    _malloc: (size: number) => {
      const ptr = next
      next += size
      return ptr
    },
    _free: () => {},
    HEAPU8: heap,
    HEAP16: new Int16Array(heap.buffer),
  }
}

vi.mock('./core/tb_core.mjs', () => ({ default: async () => fakeCore() }))
vi.mock('./core/tb_core.wasm?url', () => ({ default: 'tb_core.wasm' }))

class QuietChannel {
  port1 = { onmessage: null as unknown, postMessage: () => {} }
  port2 = { onmessage: null as unknown, postMessage: () => {} }
}

let replies: WorkerReply[]

beforeEach(() => {
  replies = []
  vi.stubGlobal('MessageChannel', QuietChannel)
  vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => void replies.push(message as WorkerReply))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const send = (message: WorkerRequest) => window.dispatchEvent(new MessageEvent('message', { data: message }))

test('loading a state publishes a snapshot of the loaded RAM, SRAM and frame before replying', async () => {
  await import('./emu.worker')
  const shared = createShared()
  send({ type: 'init', rom: new Uint8Array(16), shared, outputRate: 48000 })
  await vi.waitFor(() => expect(replies.map((r) => r.type)).toContain('ready'))
  const snap = emptySnapshot()
  expect(readSnapshot(shared.snapshot, snap)).toBe(true)
  expect(snap.frame).toBeGreaterThan(0)
  expect(snap.frame).toBeLessThan(1200)
  expect(snap.ram[0]).toBe(0xaa)
  send({ type: 'pause' })
  send({ type: 'loadState', id: 1, data: new Uint8Array([0x33, 0x44, 0, 0]), frame: 1200, recording: null })
  expect(replies).toContainEqual({ type: 'loaded', id: 1, ok: true })
  expect(readSnapshot(shared.snapshot, snap)).toBe(true)
  expect(snap.frame).toBe(1200)
  expect(snap.ram.every((b) => b === 0x33)).toBe(true)
  expect(snap.sram.every((b) => b === 0x44)).toBe(true)
})
