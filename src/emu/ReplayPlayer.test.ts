import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerReply, WorkerRequest } from './emu.worker'
import type { Emulator } from './Emulator'
import type { Clip } from './recorder'
import { ReplayPlayer } from './ReplayPlayer'

class FakeWorker {
  static last: FakeWorker | null = null
  readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  readonly sent: WorkerRequest[] = []
  terminated = false

  constructor() {
    FakeWorker.last = this
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  postMessage(message: WorkerRequest): void {
    this.sent.push(message)
    if (message.type === 'replay') queueMicrotask(() => this.reply({ type: 'ready' }))
  }

  terminate(): void {
    this.terminated = true
  }

  reply(data: WorkerReply): void {
    for (const listener of [...(this.listeners.get('message') ?? [])]) listener({ data })
  }
}

class FakeGain {
  readonly gain = { value: 1 }
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()

  constructor() {
    gains.push(this)
  }
}

class FakeNode {
  static last: FakeNode | null = null
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()

  constructor() {
    FakeNode.last = this
  }
}

const clip: Clip = { from: 100, to: 110, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }

const destination = {}
let underruns = 0
let frameCallback: FrameRequestCallback | null = null
let visibility: DocumentVisibilityState = 'visible'
const gains: FakeGain[] = []

function fakeEmulator(): Emulator {
  return {
    audioContext: () => ({ destination, sampleRate: 48000, createGain: () => new FakeGain() }),
    stats: () => ({ underruns, frame: 0 }),
  } as unknown as Emulator
}

async function startReplay(): Promise<{ player: ReplayPlayer; worker: FakeWorker; ends: string[] }> {
  const player = await ReplayPlayer.start(fakeEmulator(), new Uint8Array([9]), clip, document.createElement('canvas'))
  const ends: string[] = []
  player.onEnd((reason) => ends.push(reason))
  return { player, worker: FakeWorker.last as FakeWorker, ends }
}

describe('ReplayPlayer', () => {
  beforeEach(() => {
    underruns = 0
    frameCallback = null
    visibility = 'visible'
    gains.length = 0
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('AudioWorkletNode', FakeNode)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCallback = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      frameCallback = null
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => undefined,
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends the rom and clip to its own worker in a replay message', async () => {
    const { worker, player } = await startReplay()
    expect(worker.sent[0]).toMatchObject({ type: 'replay', clip, outputRate: 48000 })
    player.stop()
  })

  it('replays run at three quarters speed', async () => {
    const player = await ReplayPlayer.start(fakeEmulator(), new Uint8Array([9]), clip, document.createElement('canvas'), 0.75)
    expect(FakeWorker.last?.sent[0]).toMatchObject({ type: 'replay', speed: 0.75 })
    expect(player.from).toBe(clip.from)
    player.stop()
    const normal = await startReplay()
    expect(normal.worker.sent[0]).toMatchObject({ type: 'replay', speed: 1 })
    normal.player.stop()
  })

  it('a replay plays silently and leaves the live sound on', async () => {
    const live = fakeEmulator() as unknown as Record<string, unknown>
    expect(live['setLiveMuted']).toBeUndefined()
    const { player } = await startReplay()
    const silence = gains[0]
    expect(silence.gain.value).toBe(0)
    expect(FakeNode.last?.connect).toHaveBeenCalledWith(silence)
    expect(silence.connect).toHaveBeenCalledWith(destination)
    expect(FakeNode.last?.connect).not.toHaveBeenCalledWith(destination)
    player.stop()
  })

  it('every end path tears the silent chain down and ends once', async () => {
    const done = await startReplay()
    done.worker.reply({ type: 'replayDone' })
    expect(done.ends).toEqual(['done'])
    expect(done.worker.terminated).toBe(true)
    expect(FakeNode.last?.disconnect).toHaveBeenCalled()
    expect(gains[0].disconnect).toHaveBeenCalled()

    const diverged = await startReplay()
    diverged.worker.reply({ type: 'diverged', frame: 104 })
    expect(diverged.ends).toEqual(['diverged'])

    const stopped = await startReplay()
    stopped.player.stop()
    stopped.player.stop()
    stopped.worker.reply({ type: 'replayDone' })
    expect(stopped.ends).toEqual(['stopped'])
    expect(stopped.worker.terminated).toBe(true)
  })

  it('hiding the tab stops the replay', async () => {
    const { ends, worker } = await startReplay()
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(ends).toEqual(['stopped'])
    expect(worker.terminated).toBe(true)
  })

  it('a diverged replay ends with diverged', async () => {
    const { ends, worker } = await startReplay()
    worker.reply({ type: 'replayFrame', frame: 102 })
    worker.reply({ type: 'diverged', frame: 104 })
    expect(ends).toEqual(['diverged'])
  })

  it('a replay that costs the live game an audio underrun is abandoned', async () => {
    underruns = 5
    const { ends, worker } = await startReplay()
    frameCallback?.(0)
    expect(ends).toEqual([])
    underruns = 6
    frameCallback?.(0)
    expect(ends).toEqual(['stopped'])
    expect(worker.terminated).toBe(true)
  })
})
