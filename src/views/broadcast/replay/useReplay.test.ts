import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../../../emu/Emulator'
import type { Clip } from '../../../emu/recorder'
import { ReplayPlayer, type ReplayEnd } from '../../../emu/ReplayPlayer'
import { PlayTracker, type Drive, type PlayResult, type TrackerEvent } from '../../../game/playTracker'
import { lookMs, SCORING_WIPE_MS, STILL_LOOK_MS, useReplay } from './useReplay'

vi.mock('../../../emu/ReplayPlayer', () => ({ ReplayPlayer: { start: vi.fn() } }))

class FakePlayer {
  private readonly listeners = new Set<(reason: ReplayEnd) => void>()
  readonly stop = vi.fn(() => this.end('stopped'))
  private ended: ReplayEnd | null = null

  onEnd(listener: (reason: ReplayEnd) => void): () => void {
    if (this.ended) {
      listener(this.ended)
      return () => undefined
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  end(reason: ReplayEnd): void {
    if (this.ended) return
    this.ended = reason
    for (const listener of [...this.listeners]) listener(reason)
  }
}

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }
const rom = new Uint8Array([9])
const tracker = new PlayTracker({ recordRoutes: false })
const start = vi.mocked(ReplayPlayer.start)

let players: FakePlayer[] = []
let clipResult: Clip | null = clip
let pads: (Gamepad | null)[] = []
let frame: FrameRequestCallback | null = null

const emulator = {
  clip: vi.fn(async () => clipResult),
} as unknown as Emulator

const play = (overrides: Partial<PlayResult> = {}): PlayResult => ({
  index: 0,
  offense: 0,
  quarter: 1,
  yards: 25,
  touchdown: false,
  sack: false,
  interception: false,
  kicked: false,
  thrown: false,
  kind: 'scrimmage',
  isTry: false,
  routes: [],
  ball: [],
  field: { losX: 0x800, toGainX: 0x850, attacksHigh: true },
  summary: 'COOK 25 YD RUN',
  startFrame: 100,
  endFrame: 400,
  down: 1,
  toGo: 10,
  startBallOn: { yard: 25, side: 0 },
  scoreBefore: [0, 0],
  scoreAfter: [0, 0],
  tracks: { frames: [], players: [] },
  people: {},
  pass: null,
  airYards: null,
  yac: null,
  ...overrides,
})

type Props = { events: TrackerEvent[]; boxed: boolean }

function mount(initial: Props = { events: [], boxed: true }) {
  return renderHook((props: Props) => useReplay({ emulator, rom, tracker, events: props.events, boxed: props.boxed, random: () => 0 }), {
    initialProps: initial,
  })
}

const flush = () => act(async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
})

const pad = (pressed: number[]) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) }) as unknown as Gamepad

beforeEach(() => {
  players = []
  clipResult = clip
  pads = []
  frame = null
  start.mockReset()
  start.mockImplementation(async () => {
    const player = new FakePlayer()
    players.push(player)
    return player as unknown as ReplayPlayer
  })
  vi.mocked(emulator.clip).mockClear()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frame = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = null
  })
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('a replay ends the moment the play is picked', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  expect(hook.result.current?.look).toBe('footage')
  expect(hook.result.current?.player).toBe(players[0])
  expect(emulator.clip).toHaveBeenCalledWith(100, 460)
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: false })
  expect(hook.result.current).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)
})

test('a missing clip falls back to the top-down look', async () => {
  clipResult = null
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  expect(hook.result.current?.look).toBe('topdown')
  expect(hook.result.current?.player).toBeNull()
  expect(start).not.toHaveBeenCalled()
})

test('a diverged or failed footage replay falls back to the top-down look', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  act(() => players[0].end('diverged'))
  expect(hook.result.current?.look).toBe('topdown')
  expect(hook.result.current?.player).toBeNull()

  start.mockRejectedValueOnce(new Error('no core'))
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1, touchdown: true }) }], boxed: true })
  await flush()
  expect(hook.result.current?.look).toBe('topdown')
})

test('ordinary plays are not replayed', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ yards: 5, summary: 'COOK 5 YD RUN' }) }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()
})

test('the skip key and shoulder buttons end the replay', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }))
  })
  expect(hook.result.current).not.toBeNull()
  expect(players[0].stop).not.toHaveBeenCalled()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }))
  })
  expect(hook.result.current).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()

  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: true })
  await flush()
  expect(hook.result.current).not.toBeNull()
  act(() => frame?.(0))
  expect(hook.result.current).not.toBeNull()
  pads = [pad([4])]
  act(() => frame?.(16))
  expect(hook.result.current).toBeNull()

  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 2 }) }], boxed: true })
  await flush()
  pads = [pad([])]
  act(() => frame?.(32))
  pads = [pad([5])]
  act(() => frame?.(48))
  expect(hook.result.current).toBeNull()
})

test('a scoring play waits for the scoring wipe', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ touchdown: true, scoreAfter: [6, 0] }) }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  await act(async () => {
    vi.advanceTimersByTime(SCORING_WIPE_MS - 1)
  })
  expect(hook.result.current).toBeNull()
  await act(async () => {
    vi.advanceTimersByTime(1)
  })
  await flush()
  expect(hook.result.current?.look).toBe('footage')
})

test('a play that ends unboxed waits for the box and a snap cancels it', async () => {
  const hook = mount({ events: [], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: false })
  await flush()
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  expect(hook.result.current?.play.index).toBe(0)

  hook.rerender({ events: [{ type: 'snap' }], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: false })
  hook.rerender({ events: [{ type: 'snap' }], boxed: false })
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)
})

test('only one replay player runs at a time', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await flush()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1, touchdown: true }) }], boxed: true })
  await flush()
  expect(players).toHaveLength(2)
  expect(players[0].stop).toHaveBeenCalled()
  expect(hook.result.current?.player).toBe(players[1])
  act(() => players[1].end('done'))
  expect(hook.result.current).toBeNull()
})

test('the top-down look runs for the play and a short hold and the telestrator for its fixed time', async () => {
  const tracked = play({ sack: true, tracks: { frames: [100, 250, 400], players: [[], [], []] } })
  expect(lookMs('topdown', tracked)).toBe(6500)
  expect(lookMs('topdown', tracked, 0.5)).toBe(11500)
  expect(lookMs('topdown', play({ sack: true }))).toBe(STILL_LOOK_MS)
  expect(lookMs('telestrator', tracked)).toBe(STILL_LOOK_MS)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: tracked }], boxed: true })
  await flush()
  expect(hook.result.current?.look).toBe('topdown')
  await act(async () => {
    vi.advanceTimersByTime(6499)
  })
  expect(hook.result.current).not.toBeNull()
  await act(async () => {
    vi.advanceTimersByTime(1)
  })
  expect(hook.result.current).toBeNull()
})

const drive = (offense: 0 | 1, plays: number, result: Drive['result']): Drive => ({
  offense,
  plays,
  yards: 0,
  startClock: '9:00',
  result,
  startSpot: { yard: 25, side: 0 },
  endSpot: { yard: 25, side: 0 },
  endSummary: '',
  endTime: '1:00',
})

function game() {
  const list: PlayResult[] = []
  const closed: Drive[] = []
  const saved = { list, closed }
  const fake = { plays: () => saved.list, drives: () => saved.closed, lastDrive: () => saved.closed[saved.closed.length - 1] ?? null } as unknown as PlayTracker
  const hook = renderHook((props: Props) => useReplay({ emulator, rom, tracker: fake, events: props.events, boxed: props.boxed, random: () => 0 }), {
    initialProps: { events: [] as TrackerEvent[], boxed: true },
  })
  return { list, closed, saved, hook }
}

test('a change of possession replays the play of the drive once', async () => {
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, yards: 12 }), play({ index: 2, kind: 'punt', kicked: true, yards: 0 }))
  closed.push(drive(0, 3, 'PUNT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[2] }], boxed: true })
  await flush()
  expect(hook.result.current?.label).toBe('PLAY OF THE DRIVE')
  expect(hook.result.current?.play.index).toBe(0)
  act(() => players[0].end('done'))
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()

  list.push(play({ index: 3, offense: 1, yards: 25 }))
  hook.rerender({ events: [{ type: 'playEnd', play: list[3] }], boxed: true })
  await flush()
  expect(hook.result.current?.label).toBe('INSTANT REPLAY')
  list.push(play({ index: 4, offense: 1, kind: 'punt', kicked: true, yards: 0 }))
  closed.push(drive(1, 2, 'PUNT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[4] }], boxed: true })
  await flush()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }))
  })
  await flush()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)
})

test('an automatic replay due at the same moment plays before the play of the drive', async () => {
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, interception: true, yards: 0 }))
  closed.push(drive(0, 2, 'INT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await flush()
  expect(hook.result.current?.label).toBe('INSTANT REPLAY')
  expect(hook.result.current?.play.index).toBe(1)
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }))
  })
  await flush()
  expect(hook.result.current?.label).toBe('PLAY OF THE DRIVE')
  expect(hook.result.current?.play.index).toBe(0)
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  expect(hook.result.current).toBeNull()
})

test('a play of the drive waits behind the replay and a snap drops it', async () => {
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, interception: true, yards: 0 }))
  closed.push(drive(0, 2, 'INT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await flush()
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [], boxed: false })
  hook.rerender({ events: [], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
})

test('a restored game does not replay the drive it loaded', async () => {
  const { saved, hook } = game()
  saved.list = [play({ index: 0, yards: 30 })]
  saved.closed = [drive(0, 1, 'PUNT')]
  hook.rerender({ events: [], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  saved.list.push(play({ index: 1, offense: 1, yards: 18 }), play({ index: 2, offense: 1, kind: 'punt', kicked: true, yards: 0 }))
  saved.closed.push(drive(1, 2, 'PUNT'))
  hook.rerender({ events: [{ type: 'playEnd', play: saved.list[2] }], boxed: true })
  await flush()
  expect(hook.result.current?.play.index).toBe(1)
})

test('a save load drops a play of the drive still waiting', async () => {
  const { list, closed, saved, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, interception: true, yards: 0 }))
  closed.push(drive(0, 2, 'INT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await flush()
  expect(hook.result.current?.play.index).toBe(1)
  saved.list = [play({ index: 0, yards: 15 })]
  saved.closed = [drive(0, 1, 'PUNT')]
  hook.rerender({ events: [], boxed: true })
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace' }))
  })
  await flush()
  expect(hook.result.current).toBeNull()
})
