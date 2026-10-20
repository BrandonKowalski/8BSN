import { render } from '@testing-library/react'
import { vi, type Mock, type MockInstance } from 'vitest'
import Station, { type SlotRef } from '../broadcast/Station'
import type { WorkerReply } from '../emu/emu.worker'
import { Emulator } from '../emu/Emulator'
import { ReplayPlayer } from '../emu/ReplayPlayer'
import { createShared, type SharedBlocks } from '../emu/shared'
import type { TailgateInput } from '../tailgate/useTailgate'
import type { BroadcastPackage, LeagueGame, Records } from './types'

export { default as LeagueTicker, kickoffLabel, leagueEntry } from '../broadcast/LeagueTicker'
export { REPLAY_HOLD_MS } from '../broadcast/moments/runner'
export { useMoments } from '../broadcast/moments/useMoments'
export { default as stationCss } from '../broadcast/station.css?raw'
export { anchorMatches } from '../emu/anchor'
export { maskAt, scriptEnd } from '../emu/autoplay'
export type { Clip } from '../emu/recorder'
export type { ReplayEnd } from '../emu/ReplayPlayer'
export { KeyboardInput } from '../input/keyboard'
export { leagueData } from '../league/leagueData'
export { TAIL_MS } from '../tailgate/useTailgate'

export function stubReplays(start: typeof ReplayPlayer.start = () => new Promise(() => undefined)): MockInstance<typeof ReplayPlayer.start> {
  return vi.spyOn(ReplayPlayer, 'start').mockImplementation(start)
}

export type FakeWorker = { addEventListener: Mock; removeEventListener: Mock; terminate: Mock; postMessage: Mock }

export type Harness = { emu: Emulator; shared: SharedBlocks; frame: () => void; worker: FakeWorker; replyWith: (reply: WorkerReply) => void }

export function harness(pads: () => (Gamepad | null)[] | undefined): Harness {
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
  const audio = { close: vi.fn(() => Promise.resolve()), suspend: vi.fn(() => Promise.resolve()), state: 'running' }
  const Ctor = Emulator as unknown as new (s: SharedBlocks, w: unknown, a: unknown, c: HTMLCanvasElement) => Emulator
  const emu = new Ctor(shared, worker, audio, document.createElement('canvas'))
  const replyWith = (reply: WorkerReply) => {
    const [, listener] = worker.addEventListener.mock.calls.find(([type]) => type === 'message') as [string, (e: MessageEvent<WorkerReply>) => void]
    listener({ data: reply } as MessageEvent<WorkerReply>)
  }
  return { emu, shared, frame: () => callback?.(0), worker, replyWith }
}

export type StationOptions = {
  emulator?: Emulator | null
  rom?: Uint8Array | null
  sha1?: string
  canvasSlot?: SlotRef
  forceWindow?: boolean
  onForceWindow?: () => void
  tailgate?: boolean
  asking?: boolean
  onTailgateFinal?: () => void
  onTailgateInput?: (input: TailgateInput) => void
  saves?: boolean
  toast?: (text: string | null) => void
  games?: LeagueGame[] | null
  records?: Records | null
}

const noop = () => undefined

export function renderStation(pkg: BroadcastPackage, options: StationOptions = {}) {
  let current = options
  const element = (o: StationOptions) => {
    const sha1 = o.sha1 ?? pkg.roms[0]?.sha1 ?? ''
    const rom = o.rom ? { bytes: o.rom, rom: pkg.roms.find((r) => r.sha1 === sha1) ?? { sha1, title: '', about: '' } } : null
    return (
      <Station
        pkg={pkg}
        emulator={o.emulator ?? null}
        rom={rom}
        canvasSlot={o.canvasSlot ?? noop}
        forceWindow={o.forceWindow ?? false}
        onForceWindow={o.onForceWindow ?? noop}
        tailgate={o.tailgate ?? false}
        asking={o.asking ?? false}
        onTailgateFinal={o.onTailgateFinal ?? noop}
        onTailgateInput={o.onTailgateInput ?? noop}
        saves={o.saves ?? false}
        toast={o.toast ?? noop}
        feed={{ games: o.games ?? null, records: o.records ?? null }}
      />
    )
  }
  const result = render(element(current))
  return {
    ...result,
    rerender: (next: StationOptions = {}) => {
      current = { ...current, ...next }
      result.rerender(element(current))
    },
  }
}
