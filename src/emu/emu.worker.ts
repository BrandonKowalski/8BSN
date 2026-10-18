import createCore from './core/tb_core.mjs'
import wasmUrl from './core/tb_core.wasm?url'
import type { CoreModule } from './core/types'
import { isLive } from '../game/decode'
import { TSB2026_MAP } from '../game/maps/tsb2026'
import { framesToRun, resampleRatio, TARGET_FILL_FRAMES } from './pacing'
import { Recorder, type Clip, type RecordingData } from './recorder'
import { AudioRing } from './ringBuffer'
import { Ctl, VIDEO_FRAME_BYTES, VIDEO_FRAME_COUNT, type SharedBlocks } from './shared'
import { writeSnapshot } from './snapshot'

export type WorkerRequest =
  | { type: 'init'; rom: Uint8Array; shared: SharedBlocks; outputRate: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'saveState'; id: number }
  | { type: 'loadState'; id: number; data: Uint8Array; frame: number; recording: RecordingData | null }
  | { type: 'clip'; id: number; from: number; to: number }

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'resumed' }
  | { type: 'error'; message: string }
  | { type: 'saved'; id: number; data: Uint8Array | null; frame: number; recording: RecordingData }
  | { type: 'loaded'; id: number; ok: boolean }
  | { type: 'clipped'; id: number; clip: Clip | null }

const WAIT_TIMEOUT_MS = 20
const MAX_PREFILL_FRAMES = 8

class Resampler {
  private position = 0
  private lastLeft = 0
  private lastRight = 0
  private out = new Float32Array(0)

  constructor(private readonly inputRate: number, private readonly outputRate: number) {}

  process(source: Int16Array, offset: number, frames: number, ratio: number): Float32Array {
    const step = this.inputRate / (this.outputRate * ratio)
    const capacity = Math.ceil((frames + 1) / step) + 2
    if (this.out.length < capacity * 2) this.out = new Float32Array(capacity * 2)
    const out = this.out
    let written = 0
    let position = this.position
    while (position < frames) {
      const index = Math.floor(position)
      const frac = position - index
      const left0 = index === 0 ? this.lastLeft : source[offset + (index - 1) * 2] / 32768
      const right0 = index === 0 ? this.lastRight : source[offset + (index - 1) * 2 + 1] / 32768
      const left1 = source[offset + index * 2] / 32768
      const right1 = source[offset + index * 2 + 1] / 32768
      out[written * 2] = left0 + (left1 - left0) * frac
      out[written * 2 + 1] = right0 + (right1 - right0) * frac
      written++
      position += step
    }
    if (frames > 0) {
      this.position = position - frames
      this.lastLeft = source[offset + (frames - 1) * 2] / 32768
      this.lastRight = source[offset + (frames - 1) * 2 + 1] / 32768
    }
    return out.subarray(0, written * 2)
  }
}

class Runner {
  private readonly ring: AudioRing
  private readonly readIndex: Int32Array
  private readonly resampler: Resampler
  private readonly samplesPerFrame: number
  private readonly videoSlots: Uint8Array[]
  private readonly channel = new MessageChannel()
  private readonly recorder = new Recorder()
  private ram: Uint8Array
  private paused = false
  private looping = false

  constructor(private readonly core: CoreModule, private readonly shared: SharedBlocks, outputRate: number) {
    this.ring = new AudioRing(shared.ring)
    this.readIndex = this.ring.readIndexView()
    this.resampler = new Resampler(core._tb_sample_rate(), outputRate)
    this.samplesPerFrame = outputRate / core._tb_fps()
    this.videoSlots = Array.from(
      { length: VIDEO_FRAME_COUNT },
      (_, i) => new Uint8Array(shared.video, i * VIDEO_FRAME_BYTES, VIDEO_FRAME_BYTES),
    )
    this.channel.port1.onmessage = () => this.step()
    this.ram = this.ramView()
  }

  frame(): number {
    return Atomics.load(this.shared.control, Ctl.FrameCount)
  }

  recording(): RecordingData {
    return this.recorder.export()
  }

  clip(from: number, to: number): Clip | null {
    return this.recorder.clip(from, to)
  }

  start(): void {
    this.paused = false
    Atomics.store(this.shared.control, Ctl.Running, 1)
    this.prefill()
    if (!this.looping) {
      this.looping = true
      this.channel.port2.postMessage(null)
    }
  }

  pause(): void {
    this.paused = true
    Atomics.store(this.shared.control, Ctl.Running, 0)
  }

  readonly saveState = (): Uint8Array | null => {
    const core = this.core
    const size = core._tb_state_size()
    const ptr = core._malloc(size)
    try {
      return core._tb_save_state(ptr, size) === 1 ? core.HEAPU8.slice(ptr, ptr + size) : null
    } finally {
      core._free(ptr)
    }
  }

  loadState(data: Uint8Array, frame: number, recording: RecordingData | null): boolean {
    const core = this.core
    const ptr = core._malloc(data.length)
    let ok = false
    try {
      core.HEAPU8.set(data, ptr)
      ok = core._tb_load_state(ptr, data.length) === 1
    } finally {
      core._free(ptr)
    }
    if (!ok) return false
    Atomics.store(this.shared.control, Ctl.FrameCount, frame)
    if (recording) this.recorder.import(recording, frame)
    else this.recorder.clear()
    return true
  }

  private ramView(): Uint8Array {
    const ptr = this.core._tb_ram_ptr()
    return this.core.HEAPU8.subarray(ptr, ptr + this.core._tb_ram_size())
  }

  private step(): void {
    if (this.paused) {
      this.looping = false
      return
    }
    const seen = Atomics.load(this.readIndex, 0)
    this.pump(framesToRun(this.ring.available(), TARGET_FILL_FRAMES, this.samplesPerFrame))
    Atomics.wait(this.readIndex, 0, seen, WAIT_TIMEOUT_MS)
    this.channel.port2.postMessage(null)
  }

  private prefill(): void {
    for (let i = 0; i < MAX_PREFILL_FRAMES && this.ring.available() < TARGET_FILL_FRAMES; i++) this.pump(1)
  }

  private pump(frames: number): void {
    if (frames <= 0) return
    const core = this.core
    const { control, input } = this.shared
    for (let i = 0; i < frames; i++) {
      const p1 = Atomics.load(input, 0)
      const p2 = Atomics.load(input, 1)
      core._tb_set_input(0, p1)
      core._tb_set_input(1, p2)
      core._tb_run_frame()
      const ratio = resampleRatio(this.ring.available(), TARGET_FILL_FRAMES)
      this.ring.write(this.resampler.process(core.HEAP16, core._tb_audio_ptr() >> 1, core._tb_audio_frames(), ratio))
      const frame = Atomics.add(control, Ctl.FrameCount, 1) + 1
      if (this.ram.buffer !== core.HEAPU8.buffer) this.ram = this.ramView()
      this.recorder.frame(frame, p1, p2, this.ram, isLive(this.ram, TSB2026_MAP), this.saveState)
    }
    const slot = (Atomics.load(control, Ctl.VideoIndex) + 1) % VIDEO_FRAME_COUNT
    const videoPtr = core._tb_video_ptr()
    this.videoSlots[slot].set(core.HEAPU8.subarray(videoPtr, videoPtr + VIDEO_FRAME_BYTES))
    Atomics.store(control, Ctl.VideoIndex, slot)
    Atomics.add(control, Ctl.FrameSeq, 1)
    const sramPtr = core._tb_sram_ptr()
    if (this.ram.buffer !== core.HEAPU8.buffer) this.ram = this.ramView()
    writeSnapshot(
      this.shared.snapshot,
      this.ram,
      core.HEAPU8.subarray(sramPtr, sramPtr + core._tb_sram_size()),
      Atomics.load(control, Ctl.FrameCount),
    )
  }
}

let runner: Runner | null = null

function recordingBuffers(recording: RecordingData): ArrayBufferLike[] {
  return [recording.inputs.buffer, recording.hashes.buffer, ...recording.snaps.map(([, state]) => state.buffer)]
}

function reply(message: WorkerReply): void {
  self.postMessage(message)
}

async function init(rom: Uint8Array, shared: SharedBlocks, outputRate: number): Promise<void> {
  const core = await createCore({ locateFile: () => wasmUrl })
  core._tb_init()
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  if (core._tb_load_rom(ptr, rom.length) !== 1) throw new Error('The core rejected the ROM')
  runner = new Runner(core, shared, outputRate)
  runner.start()
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'init') {
    init(message.rom, message.shared, message.outputRate).then(
      () => reply({ type: 'ready' }),
      (error: unknown) => reply({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  } else if (message.type === 'pause') {
    runner?.pause()
  } else if (message.type === 'resume' && runner) {
    runner.start()
    reply({ type: 'resumed' })
  } else if (message.type === 'saveState') {
    const data = runner?.saveState() ?? null
    const frame = runner?.frame() ?? 0
    const recording = runner?.recording() ?? new Recorder().export()
    const transfer = data ? [data.buffer, ...recordingBuffers(recording)] : recordingBuffers(recording)
    self.postMessage({ type: 'saved', id: message.id, data, frame, recording } satisfies WorkerReply, { transfer: transfer as ArrayBuffer[] })
  } else if (message.type === 'loadState') {
    reply({ type: 'loaded', id: message.id, ok: runner?.loadState(message.data, message.frame, message.recording) ?? false })
  } else if (message.type === 'clip') {
    const clip = runner?.clip(message.from, message.to) ?? null
    const transfer = clip ? [clip.state.buffer, clip.inputs.buffer, clip.hashes.buffer] : []
    self.postMessage({ type: 'clipped', id: message.id, clip } satisfies WorkerReply, { transfer: transfer as ArrayBuffer[] })
  }
})
