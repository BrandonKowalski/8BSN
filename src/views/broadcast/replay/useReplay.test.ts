import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../../../emu/Emulator'
import type { Clip } from '../../../emu/recorder'
import { ReplayPlayer, type ReplayEnd } from '../../../emu/ReplayPlayer'
import { PlayTracker, type Drive, type PlayResult, type TrackerEvent } from '../../../game/playTracker'
import { LEAD_IN_MS } from './ReplayLeadIn'
import { WIPE_CAP_MS } from '../ScoringWipe'
import { CLIP_TAIL_FRAMES, REPLAY_SPEED, useReplay, useReplayState } from './useReplay'

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
  call: null,
  scramble: false,
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
  fumble: null,
  kickResult: null,
  returner: null,
  returnYards: null,
  ...overrides,
})

type Props = { events: TrackerEvent[]; boxed: boolean; celebrating?: boolean }

function mount(initial: Props = { events: [], boxed: true }) {
  return renderHook((props: Props) => useReplay({ emulator, rom, tracker, events: props.events, boxed: props.boxed, celebrating: props.celebrating }), {
    initialProps: initial,
  })
}

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
})

const wait = (ms: number) => act(async () => {
  vi.advanceTimersByTime(ms)
})

const due = async () => {
  await flush()
  await wait(LEAD_IN_MS)
  await flush()
}

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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
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
  await due()
  expect(hook.result.current?.canvas).not.toBeNull()
  expect(hook.result.current?.player).toBe(players[0])
  expect(emulator.clip).toHaveBeenCalledWith(100, 420)
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: false })
  expect(hook.result.current).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await due()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)
})

test('a replay leads in as soon as the game boxes, then plays, then gives way to the last play', async () => {
  const hook = mount({ events: [], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: false })
  await wait(5000)
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  expect(hook.result.current).toBeNull()
  await flush()
  expect(hook.result.current?.leadIn).toBe(true)
  expect(hook.result.current?.label).toBe('INSTANT REPLAY')
  expect(hook.result.current?.canvas).toBeNull()
  await wait(LEAD_IN_MS - 1)
  await flush()
  expect(hook.result.current?.leadIn).toBe(true)
  expect(start).not.toHaveBeenCalled()
  await wait(1)
  await flush()
  expect(hook.result.current?.leadIn).toBe(false)
  expect(hook.result.current?.canvas).not.toBeNull()
  expect(hook.result.current?.player).toBe(players[0])
  expect(hook.result.current?.canvas).not.toBeNull()
  act(() => players[0].end('done'))
  expect(hook.result.current).toBeNull()
})

test('the pick cuts off the lead-in', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ touchdown: true, scoreAfter: [6, 0] }) }], boxed: true, celebrating: true })
  await wait(1500)
  hook.rerender({ events: [{ type: 'playEnd', play: play({ touchdown: true, scoreAfter: [6, 0] }) }], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ touchdown: true, scoreAfter: [6, 0] }) }], boxed: true })
  await wait(2000)
  await due()
  expect(hook.result.current).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()

  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: true })
  await wait(LEAD_IN_MS / 2)
  expect(hook.result.current?.leadIn).toBe(true)
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: false })
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: true })
  await due()
  await due()
  expect(hook.result.current).toBeNull()
  expect(start).not.toHaveBeenCalled()
})

test('replays run at three quarters speed', async () => {
  expect(REPLAY_SPEED).toBe(0.75)
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await due()
  expect(start).toHaveBeenCalledWith(emulator, rom, clip, hook.result.current?.canvas, REPLAY_SPEED)
})

test('every instant replay is game footage and a missing clip skips it', async () => {
  expect(CLIP_TAIL_FRAMES).toBeLessThanOrEqual(20)
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ sack: true }) }], boxed: true })
  await due()
  expect(hook.result.current?.canvas).not.toBeNull()
  expect(hook.result.current?.player).toBe(players[0])
  act(() => players[0].end('diverged'))
  expect(hook.result.current).toBeNull()

  clipResult = null
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1, sack: true }) }], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()
  await due()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)

  clipResult = clip
  start.mockRejectedValueOnce(new Error('no core'))
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 2, interception: true }) }], boxed: true })
  await due()
  expect(hook.result.current).toBeNull()

  const bare = renderHook((props: Props) => useReplay({ emulator: null, rom, tracker, events: props.events, boxed: props.boxed }), { initialProps: { events: [] as TrackerEvent[], boxed: true } })
  bare.rerender({ events: [{ type: 'playEnd', play: play({ index: 3 }) }], boxed: true })
  expect(bare.result.current).toBeNull()
  await due()
  expect(bare.result.current).toBeNull()
})

test('ordinary plays are not replayed', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ yards: 5, summary: 'COOK 5 YD RUN' }) }], boxed: true })
  await due()
  expect(hook.result.current).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()
})

test('the skip key ends the replay and the shoulder buttons no longer do', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await due()
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
  await due()
  expect(hook.result.current).not.toBeNull()
  act(() => frame?.(0))
  pads = [pad([4, 5])]
  act(() => frame?.(16))
  expect(hook.result.current).not.toBeNull()
  expect(frame).toBeNull()
})

function onDemand(list: PlayResult[]) {
  const fake = { plays: () => list, drives: () => [], lastDrive: () => null } as unknown as PlayTracker
  return renderHook((props: Props) => useReplayState({ emulator, rom, tracker: fake, events: props.events, boxed: props.boxed, celebrating: props.celebrating }), {
    initialProps: { events: [] as TrackerEvent[], boxed: true } as Props,
  })
}

test('R2 replays an ordinary play on demand', async () => {
  const list = [play({ index: 0 }), play({ index: 1, yards: 3, summary: 'COOK 3 YD RUN', startFrame: 500, endFrame: 700 })]
  const hook = onDemand(list)
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()
  expect(hook.result.current.waiting).toBe(true)
  await flush()
  expect(hook.result.current.view?.leadIn).toBe(true)
  expect(hook.result.current.view?.label).toBe('INSTANT REPLAY')
  expect(hook.result.current.view?.play.index).toBe(1)
  await wait(LEAD_IN_MS - 1)
  expect(start).not.toHaveBeenCalled()
  await wait(1)
  await flush()
  expect(emulator.clip).toHaveBeenCalledWith(500, 720)
  expect(start).toHaveBeenCalledWith(emulator, rom, clip, hook.result.current.view?.canvas, REPLAY_SPEED)
  hook.rerender({ events: [], boxed: false })
  expect(hook.result.current.view).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()

  const scoring = [play({ index: 0, yards: 2, summary: 'COOK 2 YD RUN', touchdown: true, scoreAfter: [6, 0] })]
  const again = onDemand(scoring)
  again.rerender({ events: [{ type: 'playEnd', play: scoring[0] }], boxed: true, celebrating: true })
  expect(again.result.current.waiting).toBe(true)
  act(() => again.result.current.call())
  await flush()
  expect(again.result.current.view?.leadIn).toBe(true)
  expect(again.result.current.waiting).toBe(false)
  await due()
  expect(again.result.current.view?.leadIn).toBe(false)
  expect(again.result.current.view?.play.index).toBe(0)

  const none = onDemand([])
  act(() => none.result.current.call())
  expect(none.result.current.view).toBeNull()
})

test('R2 during a replay skips it', async () => {
  const list = [play({ index: 0 })]
  const hook = onDemand(list)
  hook.rerender({ events: [{ type: 'playEnd', play: list[0] }], boxed: true })
  await flush()
  expect(hook.result.current.view?.leadIn).toBe(true)
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()
  await due()
  expect(start).not.toHaveBeenCalled()
  act(() => hook.result.current.call())
  await due()
  expect(hook.result.current.view?.leadIn).toBe(false)
  expect(hook.result.current.view?.canvas).not.toBeNull()
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()

  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: true })
  list.push(play({ index: 1 }))
  await due()
  expect(hook.result.current.view?.player).toBe(players[1])
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()
  expect(players[1].stop).toHaveBeenCalled()
})

test('a scoring play waits for the score panels to close', async () => {
  const hook = mount()
  const ended: TrackerEvent[] = [{ type: 'playEnd', play: play({ touchdown: true, scoreAfter: [6, 0] }) }]
  hook.rerender({ events: ended, boxed: true, celebrating: true })
  await flush()
  expect(hook.result.current).toBeNull()
  await wait(WIPE_CAP_MS * 2)
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: ended, boxed: true, celebrating: false })
  await flush()
  expect(hook.result.current?.leadIn).toBe(true)
  await wait(LEAD_IN_MS)
  await flush()
  expect(hook.result.current?.canvas).not.toBeNull()
})

test('a play that ends unboxed waits for the box and a snap cancels it', async () => {
  const hook = mount({ events: [], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: false })
  await due()
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await due()
  expect(hook.result.current?.play.index).toBe(0)

  hook.rerender({ events: [{ type: 'snap' }], boxed: false })
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1 }) }], boxed: false })
  hook.rerender({ events: [{ type: 'snap' }], boxed: false })
  hook.rerender({ events: [{ type: 'snap' }], boxed: true })
  await due()
  expect(hook.result.current).toBeNull()
  expect(start).toHaveBeenCalledTimes(1)
})

test('only one replay player runs at a time', async () => {
  const hook = mount()
  hook.rerender({ events: [{ type: 'playEnd', play: play() }], boxed: true })
  await due()
  hook.rerender({ events: [{ type: 'playEnd', play: play({ index: 1, touchdown: true }) }], boxed: true })
  await due()
  expect(players).toHaveLength(2)
  expect(players[0].stop).toHaveBeenCalled()
  expect(hook.result.current?.player).toBe(players[1])
  act(() => players[1].end('done'))
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
  const hook = renderHook((props: Props) => useReplay({ emulator, rom, tracker: fake, events: props.events, boxed: props.boxed }), {
    initialProps: { events: [] as TrackerEvent[], boxed: true } as Props,
  })
  return { list, closed, saved, hook }
}

test('a change of possession replays the play of the drive once', async () => {
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, yards: 12 }), play({ index: 2, kind: 'punt', kicked: true, yards: 0 }))
  closed.push(drive(0, 3, 'PUNT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[2] }], boxed: true })
  await due()
  expect(hook.result.current?.label).toBe('PLAY OF THE DRIVE')
  expect(hook.result.current?.play.index).toBe(0)
  act(() => players[0].end('done'))
  expect(hook.result.current).toBeNull()
  hook.rerender({ events: [], boxed: true })
  await flush()
  expect(hook.result.current).toBeNull()

  list.push(play({ index: 3, offense: 1, yards: 25 }))
  hook.rerender({ events: [{ type: 'playEnd', play: list[3] }], boxed: true })
  await due()
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
  expect(start).toHaveBeenCalledTimes(2)
})

test('an automatic replay due at the same moment plays before the play of the drive', async () => {
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, interception: true, yards: 0 }))
  closed.push(drive(0, 2, 'INT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await due()
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
  await due()
  expect(hook.result.current?.play.index).toBe(1)
})

test('a save load drops a play of the drive still waiting', async () => {
  const { list, closed, saved, hook } = game()
  list.push(play({ index: 0, yards: 15 }), play({ index: 1, interception: true, yards: 0 }))
  closed.push(drive(0, 2, 'INT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  await due()
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

test('a missing clip skips a play of the drive and an R2 replay without a lead-in', async () => {
  clipResult = null
  const { list, closed, hook } = game()
  list.push(play({ index: 0, yards: 15, startFrame: 300, endFrame: 500 }), play({ index: 1, kind: 'punt', kicked: true, yards: 0 }))
  closed.push(drive(0, 2, 'PUNT'))
  hook.rerender({ events: [{ type: 'playEnd', play: list[1] }], boxed: true })
  expect(hook.result.current).toBeNull()
  await flush()
  expect(emulator.clip).toHaveBeenCalledWith(300, 520)
  expect(hook.result.current).toBeNull()
  await due()
  expect(hook.result.current).toBeNull()

  const r2 = onDemand([play({ index: 0, yards: 3, summary: 'COOK 3 YD RUN' })])
  act(() => r2.result.current.call())
  expect(r2.result.current.view).toBeNull()
  expect(r2.result.current.waiting).toBe(true)
  await flush()
  expect(r2.result.current.view).toBeNull()
  expect(r2.result.current.waiting).toBe(false)
  await due()
  expect(r2.result.current.view).toBeNull()
  expect(start).not.toHaveBeenCalled()
})
