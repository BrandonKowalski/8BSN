import type { AudioProcessorOptions } from './audio.worklet'
import type { WorkerReply, WorkerRequest } from './emu.worker'
import { waitForReady, type Emulator } from './Emulator'
import { drawLatest, VISIBLE_HEIGHT } from './presenter'
import type { Clip } from './recorder'
import { AUDIO_PROCESSOR, createShared, Ctl, VIDEO_WIDTH, type SharedBlocks } from './shared'
import { readSnapshot, type Snapshot } from './snapshot'

export type ReplayEnd = 'done' | 'diverged' | 'stopped'

export class ReplayPlayer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly listeners = new Set<(reason: ReplayEnd) => void>()
  private readonly baseUnderruns: number
  private lastSeq = 0
  private raf = 0
  private ended: ReplayEnd | null = null
  readonly from: number

  private constructor(
    private readonly emulator: Emulator,
    private readonly shared: SharedBlocks,
    private readonly worker: Worker,
    private readonly node: AudioWorkletNode,
    canvas: HTMLCanvasElement,
    clip: Clip,
  ) {
    this.from = clip.from
    canvas.width = VIDEO_WIDTH
    canvas.height = VISIBLE_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is unavailable')
    this.ctx = ctx
    this.image = ctx.createImageData(VIDEO_WIDTH, VISIBLE_HEIGHT)
    this.baseUnderruns = emulator.stats().underruns
    emulator.setLiveMuted(true)
    worker.addEventListener('message', this.onWorkerMessage)
    worker.addEventListener('error', this.onWorkerError)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.raf = requestAnimationFrame(this.tick)
  }

  static async start(emulator: Emulator, rom: Uint8Array, clip: Clip, canvas: HTMLCanvasElement, speed = 1): Promise<ReplayPlayer> {
    const audio = emulator.audioContext()
    const shared = createShared()
    const worker = new Worker(new URL('./emu.worker.ts', import.meta.url), { type: 'module' })
    let node: AudioWorkletNode | null = null
    try {
      const ready = waitForReady(worker)
      const message: WorkerRequest = { type: 'replay', rom, shared, outputRate: audio.sampleRate, clip, speed }
      worker.postMessage(message)
      await ready
      const processorOptions: AudioProcessorOptions = { ring: shared.ring, control: shared.control.buffer as SharedArrayBuffer }
      node = new AudioWorkletNode(audio, AUDIO_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions,
      })
      node.connect(audio.destination)
      const player = new ReplayPlayer(emulator, shared, worker, node, canvas, clip)
      if (document.visibilityState === 'hidden') player.end('stopped')
      return player
    } catch (error) {
      worker.terminate()
      node?.disconnect()
      throw error
    }
  }

  readSnapshot(into: Snapshot): boolean {
    return readSnapshot(this.shared.snapshot, into)
  }

  onEnd(listener: (reason: ReplayEnd) => void): () => void {
    if (this.ended) {
      listener(this.ended)
      return () => undefined
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stop(): void {
    this.end('stopped')
  }

  private end(reason: ReplayEnd): void {
    if (this.ended) return
    this.ended = reason
    cancelAnimationFrame(this.raf)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.worker.removeEventListener('message', this.onWorkerMessage)
    this.worker.removeEventListener('error', this.onWorkerError)
    this.worker.terminate()
    this.node.disconnect()
    this.emulator.setLiveMuted(false)
    for (const listener of [...this.listeners]) listener(reason)
    this.listeners.clear()
  }

  private readonly tick = () => {
    if (this.emulator.stats().underruns > this.baseUnderruns) {
      this.end('stopped')
      return
    }
    const { control, video } = this.shared
    const seq = Atomics.load(control, Ctl.FrameSeq)
    if (seq !== this.lastSeq) {
      this.lastSeq = seq
      drawLatest(this.ctx, video, Atomics.load(control, Ctl.VideoIndex), this.image)
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.end('stopped')
  }

  private readonly onWorkerError = () => {
    this.end('stopped')
  }

  private readonly onWorkerMessage = (event: MessageEvent<WorkerReply>) => {
    if (event.data.type === 'replayDone') this.end('done')
    else if (event.data.type === 'diverged') this.end('diverged')
    else if (event.data.type === 'error') this.end('stopped')
  }
}
