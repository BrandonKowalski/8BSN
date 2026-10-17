import { PadSlots } from '../input/gamepad'
import { KeyboardInput } from '../input/keyboard'
import type { AudioProcessorOptions } from './audio.worklet'
import workletUrl from './audio.worklet.ts?worker&url'
import type { WorkerReply, WorkerRequest } from './emu.worker'
import { drawLatest, VISIBLE_HEIGHT } from './presenter'
import { AudioRing } from './ringBuffer'
import { AUDIO_PROCESSOR, createShared, Ctl, VIDEO_WIDTH, type SharedBlocks } from './shared'
import { readSnapshot, type Snapshot } from './snapshot'

function send(worker: Worker, message: WorkerRequest): void {
  worker.postMessage(message)
}

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.type === 'ready') {
        cleanup()
        resolve()
      } else if (event.data.type === 'error') {
        cleanup()
        reject(new Error(event.data.message))
      }
    }
    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(new Error(event.message || 'The emulator worker failed to start'))
    }
    const cleanup = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
  })
}

export class Emulator {
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly pads = new PadSlots()
  private readonly keyboard: KeyboardInput
  private readonly ring: AudioRing
  private lastSeq = 0
  private raf = 0
  private stopped = false

  private constructor(
    private readonly shared: SharedBlocks,
    private readonly worker: Worker,
    private readonly audio: AudioContext,
    canvas: HTMLCanvasElement,
  ) {
    canvas.width = VIDEO_WIDTH
    canvas.height = VISIBLE_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
    this.image = ctx.createImageData(VIDEO_WIDTH, VISIBLE_HEIGHT)
    this.keyboard = new KeyboardInput(window)
    this.ring = new AudioRing(shared.ring)
    worker.addEventListener('message', this.onWorkerMessage)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.raf = requestAnimationFrame(this.tick)
  }

  static async start(rom: Uint8Array, canvas: HTMLCanvasElement): Promise<Emulator> {
    const audio = new AudioContext({ latencyHint: 'interactive' })
    let worker: Worker | null = null
    try {
      await audio.audioWorklet.addModule(workletUrl)
      const shared = createShared()
      worker = new Worker(new URL('./emu.worker.ts', import.meta.url), { type: 'module' })
      const ready = waitForReady(worker)
      send(worker, { type: 'init', rom, shared, outputRate: audio.sampleRate })
      await ready
      const processorOptions: AudioProcessorOptions = { ring: shared.ring, control: shared.control.buffer as SharedArrayBuffer }
      const node = new AudioWorkletNode(audio, AUDIO_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions,
      })
      node.connect(audio.destination)
      const emulator = new Emulator(shared, worker, audio, canvas)
      void emulator.resumeAudio()
      if (document.visibilityState === 'hidden') emulator.onVisibility()
      return emulator
    } catch (error) {
      worker?.terminate()
      void audio.close()
      throw error
    }
  }

  audioRunning(): boolean {
    return this.audio.state === 'running'
  }

  async resumeAudio(): Promise<boolean> {
    try {
      await this.audio.resume()
    } catch {
      return this.audioRunning()
    }
    return this.audioRunning()
  }

  onAudioChange(listener: () => void): () => void {
    this.audio.addEventListener('statechange', listener)
    return () => this.audio.removeEventListener('statechange', listener)
  }

  readSnapshot(into: Snapshot): boolean {
    return readSnapshot(this.shared.snapshot, into)
  }

  stats(): { underruns: number; frame: number } {
    return {
      underruns: Atomics.load(this.shared.control, Ctl.Underruns),
      frame: Atomics.load(this.shared.control, Ctl.FrameCount),
    }
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    cancelAnimationFrame(this.raf)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.worker.removeEventListener('message', this.onWorkerMessage)
    this.keyboard.dispose()
    this.worker.terminate()
    void this.audio.close()
  }

  private readonly tick = () => {
    const { control, input, video } = this.shared
    const [pad0, pad1] = this.pads.update(navigator.getGamepads())
    const [key0, key1] = this.keyboard.masks()
    Atomics.store(input, 0, pad0 | key0)
    Atomics.store(input, 1, pad1 | key1)
    const seq = Atomics.load(control, Ctl.FrameSeq)
    if (seq !== this.lastSeq) {
      this.lastSeq = seq
      drawLatest(this.ctx, video, Atomics.load(control, Ctl.VideoIndex), this.image)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      send(this.worker, { type: 'pause' })
      void this.audio.suspend()
    } else {
      this.ring.clear()
      send(this.worker, { type: 'resume' })
    }
  }

  private readonly onWorkerMessage = (event: MessageEvent<WorkerReply>) => {
    if (event.data.type === 'resumed' && document.visibilityState === 'visible' && !this.stopped) {
      void this.audio.resume()
    }
  }
}
