import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Btn } from '../input/buttons'
import type { WorkerReply } from './emu.worker'
import { Emulator } from './Emulator'
import { createShared, type SharedBlocks } from './shared'

describe('Emulator.resumeAudio', () => {
  it('calls resume on every call so a later gesture can succeed after a never-settling first call', async () => {
    let state = 'suspended'
    let calls = 0
    const audio = {
      get state() {
        return state
      },
      resume: () => {
        calls += 1
        if (calls === 1) return new Promise<void>(() => undefined)
        state = 'running'
        return Promise.resolve()
      },
    }
    const emu = Object.create(Emulator.prototype) as Emulator
    Object.assign(emu, { audio })
    void emu.resumeAudio()
    expect(await emu.resumeAudio()).toBe(true)
    expect(calls).toBe(2)
  })
})

type Harness = { emu: Emulator; shared: SharedBlocks; frame: () => void; worker: FakeWorker; replyWith: (reply: WorkerReply) => void }

type FakeWorker = { addEventListener: Mock; removeEventListener: Mock; terminate: Mock; postMessage: Mock }

function harness(pads: () => (Gamepad | null)[] | undefined): Harness {
  let callback: FrameRequestCallback | null = null
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    callback = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: pads() === undefined ? undefined : pads })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  } as unknown as CanvasRenderingContext2D)
  const shared = createShared()
  const worker: FakeWorker = { addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn(), postMessage: vi.fn() }
  const audio = { close: vi.fn(() => Promise.resolve()), state: 'running' }
  const Ctor = Emulator as unknown as new (s: SharedBlocks, w: unknown, a: unknown, c: HTMLCanvasElement) => Emulator
  const emu = new Ctor(shared, worker, audio, document.createElement('canvas'))
  const replyWith = (reply: WorkerReply) => {
    const [, listener] = worker.addEventListener.mock.calls.find(([type]) => type === 'message') as [string, (e: MessageEvent<WorkerReply>) => void]
    listener({ data: reply } as MessageEvent<WorkerReply>)
  }
  return { emu, shared, frame: () => callback?.(0), worker, replyWith }
}

const pressing = (index: number): Gamepad =>
  ({ id: 'pad', index, connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 })) }) as unknown as Gamepad

describe('Emulator input', () => {
  let current: Harness | null = null
  afterEach(() => {
    current?.emu.stop()
    current = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('writes a key press to the shared input inside the key handler', () => {
    current = harness(() => [])
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', cancelable: true }))
    expect(Atomics.load(current.shared.input, 0)).toBe(Btn.A)
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', cancelable: true }))
    expect(Atomics.load(current.shared.input, 0)).toBe(0)
  })

  it('ORs a key press with the last polled pad mask', () => {
    current = harness(() => [pressing(0)])
    current.frame()
    expect(Atomics.load(current.shared.input, 0)).toBe(Btn.B)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', cancelable: true }))
    expect(Atomics.load(current.shared.input, 0)).toBe(Btn.B | Btn.A)
  })

  it('keeps drawing when navigator.getGamepads is missing', () => {
    current = harness(() => undefined)
    expect(() => current?.frame()).not.toThrow()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', cancelable: true }))
    expect(Atomics.load(current.shared.input, 1)).toBe(Btn.A)
  })
})

describe('Emulator recording requests', () => {
  let current: Harness | null = null
  afterEach(() => {
    current?.emu.stop()
    current = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const recording = { origin: 10, inputs: new Uint16Array([1, 2]), hashes: new Uint32Array([3]), snaps: [] as [number, Uint8Array][] }

  it('loading a state sends the frame and recording to the worker', async () => {
    current = harness(() => [])
    const core = new Uint8Array([1, 2, 3])
    const done = current.emu.loadState(core, 10, recording)
    const sent = current.worker.postMessage.mock.calls[0][0]
    expect(sent).toMatchObject({ type: 'loadState', data: core, frame: 10, recording })
    current.replyWith({ type: 'loaded', id: sent.id, ok: true })
    await expect(done).resolves.toBeUndefined()
  })

  it('saving a state hands back the core, frame and recording', async () => {
    current = harness(() => [])
    const done = current.emu.saveState()
    const sent = current.worker.postMessage.mock.calls[0][0]
    const core = new Uint8Array([4, 5])
    current.replyWith({ type: 'saved', id: sent.id, data: core, frame: 10, recording })
    await expect(done).resolves.toEqual({ core, frame: 10, recording })
  })

  it('asking for a clip resolves with the clip the worker cut', async () => {
    current = harness(() => [])
    const done = current.emu.clip(40, 80)
    const sent = current.worker.postMessage.mock.calls[0][0]
    expect(sent).toMatchObject({ type: 'clip', from: 40, to: 80 })
    const clip = { from: 40, to: 80, state: new Uint8Array([1]), inputs: new Uint16Array(82), hashes: new Uint32Array(41) }
    current.replyWith({ type: 'clipped', id: sent.id, clip })
    await expect(done).resolves.toBe(clip)
  })
})

describe('Emulator live controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('pause and resume reach the worker and the audio context is exposed', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    } as unknown as CanvasRenderingContext2D)
    const worker = { addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn(), postMessage: vi.fn() }
    const audio = { close: vi.fn(() => Promise.resolve()), state: 'running' }
    const Ctor = Emulator as unknown as new (s: SharedBlocks, w: unknown, a: unknown, c: HTMLCanvasElement) => Emulator
    const emu = new Ctor(createShared(), worker, audio, document.createElement('canvas'))
    emu.pause()
    emu.resume()
    expect(worker.postMessage.mock.calls.map(([m]) => m.type)).toEqual(['pause', 'resume'])
    expect(emu.audioContext()).toBe(audio)
    emu.stop()
  })

  it('a paused emulator stays paused when the tab comes back and resumes on its own call', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    } as unknown as CanvasRenderingContext2D)
    const worker = { addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn(), postMessage: vi.fn() }
    const audio = { close: vi.fn(() => Promise.resolve()), suspend: vi.fn(() => Promise.resolve()), state: 'running' }
    const Ctor = Emulator as unknown as new (s: SharedBlocks, w: unknown, a: unknown, c: HTMLCanvasElement) => Emulator
    const emu = new Ctor(createShared(), worker, audio, document.createElement('canvas'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    emu.pause()
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(worker.postMessage.mock.calls.map(([m]) => m.type)).toEqual(['pause', 'pause'])
    emu.resume()
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(worker.postMessage.mock.calls.map(([m]) => m.type)).toEqual(['pause', 'pause', 'resume', 'pause', 'resume'])
    emu.stop()
  })
})
