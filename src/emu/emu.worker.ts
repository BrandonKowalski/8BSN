import createCore from './core/tb_core.mjs'
import wasmUrl from './core/tb_core.wasm?url'
import type { CoreModule } from './core/types'
import { framesToRun, resampleRatio, TARGET_FILL_FRAMES } from './pacing'
import { AudioRing } from './ringBuffer'
import { Ctl, VIDEO_FRAME_BYTES, VIDEO_FRAME_COUNT, type SharedBlocks } from './shared'
import { writeSnapshot } from './snapshot'

export type WorkerRequest =
  | { type: 'init'; rom: Uint8Array; shared: SharedBlocks; outputRate: number }
  | { type: 'pause' }
  | { type: 'resume' }

export type WorkerReply = { type: 'ready' } | { type: 'resumed' } | { type: 'error'; message: string }

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
      core._tb_set_input(0, Atomics.load(input, 0))
      core._tb_set_input(1, Atomics.load(input, 1))
      core._tb_run_frame()
      const ratio = resampleRatio(this.ring.available(), TARGET_FILL_FRAMES)
      this.ring.write(this.resampler.process(core.HEAP16, core._tb_audio_ptr() >> 1, core._tb_audio_frames(), ratio))
      Atomics.add(control, Ctl.FrameCount, 1)
    }
    const slot = (Atomics.load(control, Ctl.VideoIndex) + 1) % VIDEO_FRAME_COUNT
    const videoPtr = core._tb_video_ptr()
    this.videoSlots[slot].set(core.HEAPU8.subarray(videoPtr, videoPtr + VIDEO_FRAME_BYTES))
    Atomics.store(control, Ctl.VideoIndex, slot)
    Atomics.add(control, Ctl.FrameSeq, 1)
    const ramPtr = core._tb_ram_ptr()
    const sramPtr = core._tb_sram_ptr()
    writeSnapshot(
      this.shared.snapshot,
      core.HEAPU8.subarray(ramPtr, ramPtr + core._tb_ram_size()),
      core.HEAPU8.subarray(sramPtr, sramPtr + core._tb_sram_size()),
      Atomics.load(control, Ctl.FrameCount),
    )
  }
}

let runner: Runner | null = null

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
  }
})
