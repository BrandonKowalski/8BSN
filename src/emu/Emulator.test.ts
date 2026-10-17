import { afterEach, describe, expect, it, vi } from 'vitest'
import { Btn } from '../input/buttons'
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

type Harness = { emu: Emulator; shared: SharedBlocks; frame: () => void }

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
  const worker = { addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn(), postMessage: vi.fn() }
  const audio = { close: vi.fn(() => Promise.resolve()), state: 'running' }
  const Ctor = Emulator as unknown as new (s: SharedBlocks, w: unknown, a: unknown, c: HTMLCanvasElement) => Emulator
  const emu = new Ctor(shared, worker, audio, document.createElement('canvas'))
  return { emu, shared, frame: () => callback?.(0) }
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
