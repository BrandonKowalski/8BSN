import { PadSlots } from '../input/gamepad'
import { KeyboardInput } from '../input/keyboard'
import type { AudioProcessorOptions } from './audio.worklet'
import workletUrl from './audio.worklet.ts?worker&url'
import type { WorkerReply, WorkerRequest } from './emu.worker'
import { drawLatest, VISIBLE_HEIGHT } from './presenter'
import type { Clip, RecordingData } from './recorder'
import { AudioRing } from './ringBuffer'
import { AUDIO_PROCESSOR, createShared, Ctl, VIDEO_WIDTH, type SharedBlocks } from './shared'
import { readSnapshot, type Snapshot } from './snapshot'

function send(worker: Worker, message: WorkerRequest): void {
  worker.postMessage(message)
}

export function waitForReady(worker: Worker): Promise<void> {
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

const STOPPED: WorkerReply = { type: 'error', message: 'The emulator stopped' }

export class Emulator {
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly pads = new PadSlots()
  private readonly keyboard: KeyboardInput
  private readonly ring: AudioRing
  private lastSeq = 0
  private padMasks: [number, number] = [0, 0]
  private keyMasks: [number, number] = [0, 0]
  private raf = 0
  private stopped = false
  private held = false
  private holds = 0
  private releasing = false
  private requestId = 0
  private readonly pending = new Map<number, (reply: WorkerReply) => void>()

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
    this.keyboard = new KeyboardInput(window, this.onKeys)
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

  audioContext(): AudioContext {
    return this.audio
  }

  pause(): void {
    this.holds += 1
    this.held = true
    this.releasing = false
    send(this.worker, { type: 'pause' })
  }

  resume(): void {
    if (this.holds === 0) return
    this.holds -= 1
    if (this.holds > 0) return
    this.releasing = this.held
    this.release()
  }

  private release() {
    if (!this.releasing || this.padMasks[0] | this.padMasks[1] | this.keyMasks[0] | this.keyMasks[1]) return
    this.releasing = false
    this.held = false
    if (document.visibilityState !== 'hidden') send(this.worker, { type: 'resume' })
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

  saveState(): Promise<{ core: Uint8Array; frame: number; recording: RecordingData }> {
    return this.request({ type: 'saveState', id: ++this.requestId }).then((reply) => {
      if (reply.type !== 'saved' || !reply.data) throw new Error('The emulator could not save its state')
      return { core: reply.data, frame: reply.frame, recording: reply.recording }
    })
  }

  loadState(core: Uint8Array, frame: number, recording: RecordingData | null): Promise<void> {
    return this.request({ type: 'loadState', id: ++this.requestId, data: core, frame, recording }).then((reply) => {
      if (reply.type !== 'loaded' || !reply.ok) throw new Error('The emulator rejected the saved state')
    })
  }

  clip(from: number, to: number): Promise<Clip | null> {
    return this.request({ type: 'clip', id: ++this.requestId, from, to }).then((reply) => {
      if (reply.type !== 'clipped') throw new Error('The emulator could not cut a clip')
      return reply.clip
    })
  }

  private request(message: Extract<WorkerRequest, { id: number }>): Promise<WorkerReply> {
    return new Promise((resolve) => {
      if (this.stopped) return resolve(STOPPED)
      this.pending.set(message.id, resolve)
      send(this.worker, message)
    })
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
    for (const resolve of this.pending.values()) resolve(STOPPED)
    this.pending.clear()
  }

  private readonly tick = () => {
    const { control, video } = this.shared
    this.padMasks = this.pads.update(navigator.getGamepads?.() ?? [])
    this.writeInput()
    const seq = Atomics.load(control, Ctl.FrameSeq)
    if (seq !== this.lastSeq) {
      this.lastSeq = seq
      drawLatest(this.ctx, video, Atomics.load(control, Ctl.VideoIndex), this.image)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  private readonly onKeys = (masks: [number, number]) => {
    this.keyMasks = masks
    this.writeInput()
  }

  private writeInput() {
    const { input } = this.shared
    Atomics.store(input, 0, this.padMasks[0] | this.keyMasks[0])
    Atomics.store(input, 1, this.padMasks[1] | this.keyMasks[1])
    this.release()
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      send(this.worker, { type: 'pause' })
      void this.audio.suspend()
    } else {
      this.ring.clear()
      if (!this.held) send(this.worker, { type: 'resume' })
    }
  }

  private readonly onWorkerMessage = (event: MessageEvent<WorkerReply>) => {
    if ('id' in event.data) {
      const resolve = this.pending.get(event.data.id)
      this.pending.delete(event.data.id)
      resolve?.(event.data)
      return
    }
    if (event.data.type === 'resumed' && document.visibilityState === 'visible' && !this.stopped) {
      void this.audio.resume()
    }
  }
}
