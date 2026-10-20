import createCore from './core/tb_core.mjs'
import wasmUrl from './core/tb_core.wasm?url'
import type { CoreModule } from './core/types'
import { anchorMatches } from './anchor'
import { maskAt, type Press } from './autoplay'
import type { RamTest } from '../sdk/types'
import { framesToRun, pacedRate, resampleRatio, TARGET_FILL_FRAMES } from './pacing'
import { ramHash, Recorder, type Clip, type RecordingData } from './recorder'
import { AudioRing } from './ringBuffer'
import { Ctl, VIDEO_FRAME_BYTES, VIDEO_FRAME_COUNT, type SharedBlocks } from './shared'
import { writeSnapshot } from './snapshot'

export type WorkerRequest =
  | { type: 'init'; rom: Uint8Array; shared: SharedBlocks; outputRate: number; anchor: readonly RamTest[] | null }
  | { type: 'replay'; rom: Uint8Array; shared: SharedBlocks; outputRate: number; clip: Clip; speed: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'saveState'; id: number }
  | { type: 'loadState'; id: number; data: Uint8Array; frame: number; recording: RecordingData | null }
  | { type: 'clip'; id: number; from: number; to: number }
  | { type: 'autoplay'; presses: Press[] | null }

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'resumed' }
  | { type: 'error'; message: string }
  | { type: 'saved'; id: number; data: Uint8Array | null; frame: number; recording: RecordingData }
  | { type: 'loaded'; id: number; ok: boolean }
  | { type: 'clipped'; id: number; clip: Clip | null }
  | { type: 'replayFrame'; frame: number }
  | { type: 'diverged'; frame: number }
  | { type: 'replayDone' }

type InputSource = (frame: number) => [number, number]
type FrameHook = (frame: number, p1: number, p2: number, ram: Uint8Array) => boolean

const WAIT_TIMEOUT_MS = 20
const MAX_PREFILL_FRAMES = 8
const REPLAY_FRAME_EVERY = 10

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
  private readonly onFrame: FrameHook
  private paused = false
  private looping = false

  constructor(
    private readonly core: CoreModule,
    private readonly shared: SharedBlocks,
    outputRate: number,
    private readonly input: InputSource,
    onFrame: FrameHook | null,
    speed = 1,
    private readonly anchor: readonly RamTest[] | null = null,
  ) {
    this.onFrame = onFrame ?? this.record
    this.ring = new AudioRing(shared.ring)
    this.readIndex = this.ring.readIndexView()
    const paced = pacedRate(outputRate, speed)
    this.resampler = new Resampler(core._tb_sample_rate(), paced)
    this.samplesPerFrame = paced / core._tb_fps()
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
    this.publish()
    if (recording) this.recorder.import(recording, frame)
    else this.recorder.clear()
    return true
  }

  private readonly record: FrameHook = (frame, p1, p2, ram) => {
    this.recorder.frame(frame, p1, p2, ram, this.anchor ? anchorMatches(ram, this.anchor) : null, this.saveState)
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
    for (let i = 0; i < MAX_PREFILL_FRAMES && !this.paused && this.ring.available() < TARGET_FILL_FRAMES; i++) this.pump(1)
  }

  private pump(frames: number): void {
    if (frames <= 0) return
    const core = this.core
    const { control } = this.shared
    for (let i = 0; i < frames; i++) {
      const [p1, p2] = this.input(Atomics.load(control, Ctl.FrameCount) + 1)
      core._tb_set_input(0, p1)
      core._tb_set_input(1, p2)
      core._tb_run_frame()
      const ratio = resampleRatio(this.ring.available(), TARGET_FILL_FRAMES)
      this.ring.write(this.resampler.process(core.HEAP16, core._tb_audio_ptr() >> 1, core._tb_audio_frames(), ratio))
      const frame = Atomics.add(control, Ctl.FrameCount, 1) + 1
      if (this.ram.buffer !== core.HEAPU8.buffer) this.ram = this.ramView()
      if (!this.onFrame(frame, p1, p2, this.ram)) {
        this.pause()
        break
      }
    }
    const slot = (Atomics.load(control, Ctl.VideoIndex) + 1) % VIDEO_FRAME_COUNT
    const videoPtr = core._tb_video_ptr()
    this.videoSlots[slot].set(core.HEAPU8.subarray(videoPtr, videoPtr + VIDEO_FRAME_BYTES))
    Atomics.store(control, Ctl.VideoIndex, slot)
    Atomics.add(control, Ctl.FrameSeq, 1)
    this.publish()
  }

  private publish(): void {
    const core = this.core
    const sramPtr = core._tb_sram_ptr()
    if (this.ram.buffer !== core.HEAPU8.buffer) this.ram = this.ramView()
    writeSnapshot(
      this.shared.snapshot,
      this.ram,
      core.HEAPU8.subarray(sramPtr, sramPtr + core._tb_sram_size()),
      Atomics.load(this.shared.control, Ctl.FrameCount),
    )
  }
}

let runner: Runner | null = null
let autoplay: { presses: Press[]; origin: number } | null = null

function recordingBuffers(recording: RecordingData): ArrayBufferLike[] {
  return [recording.inputs.buffer, recording.hashes.buffer, ...recording.snaps.map(([, state]) => state.buffer)]
}

function reply(message: WorkerReply): void {
  self.postMessage(message)
}

async function boot(rom: Uint8Array): Promise<CoreModule> {
  const core = await createCore({ locateFile: () => wasmUrl })
  core._tb_init()
  const ptr = core._malloc(rom.length)
  core.HEAPU8.set(rom, ptr)
  if (core._tb_load_rom(ptr, rom.length) !== 1) throw new Error('The core rejected the ROM')
  return core
}

function sharedInput(input: Int32Array): InputSource {
  const pads: [number, number] = [0, 0]
  return (frame) => {
    pads[0] = Atomics.load(input, 0) | (autoplay ? maskAt(autoplay.presses, frame - autoplay.origin) : 0)
    pads[1] = Atomics.load(input, 1)
    return pads
  }
}

function clipInput(clip: Clip): InputSource {
  const pads: [number, number] = [0, 0]
  return (frame) => {
    pads[0] = clip.inputs[frame * 2]
    pads[1] = clip.inputs[frame * 2 + 1]
    return pads
  }
}

function clipCheck(clip: Clip): FrameHook {
  const last = clip.hashes.length - 1
  return (frame, _p1, _p2, ram) => {
    if (ramHash(ram) !== clip.hashes[frame]) {
      reply({ type: 'diverged', frame: clip.from + frame })
      return false
    }
    if (frame >= last) {
      reply({ type: 'replayDone' })
      return false
    }
    if (frame % REPLAY_FRAME_EVERY === 0) reply({ type: 'replayFrame', frame: clip.from + frame })
    return true
  }
}

async function init(rom: Uint8Array, shared: SharedBlocks, outputRate: number, anchor: readonly RamTest[] | null): Promise<void> {
  runner = new Runner(await boot(rom), shared, outputRate, sharedInput(shared.input), null, 1, anchor)
  runner.start()
}

async function replay(rom: Uint8Array, shared: SharedBlocks, outputRate: number, clip: Clip, speed: number): Promise<boolean> {
  runner = new Runner(await boot(rom), shared, outputRate, clipInput(clip), clipCheck(clip), speed)
  if (!runner.loadState(clip.state, 0, null)) throw new Error('The replay core rejected the clip state')
  if (clip.hashes.length <= 1) return true
  runner.start()
  return false
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'init') {
    init(message.rom, message.shared, message.outputRate, message.anchor).then(
      () => reply({ type: 'ready' }),
      (error: unknown) => reply({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  } else if (message.type === 'replay') {
    replay(message.rom, message.shared, message.outputRate, message.clip, message.speed).then(
      (finished) => {
        reply({ type: 'ready' })
        if (finished) reply({ type: 'replayDone' })
      },
      (error: unknown) => reply({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    )
  } else if (message.type === 'autoplay') {
    autoplay = message.presses ? { presses: message.presses, origin: runner?.frame() ?? 0 } : null
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
