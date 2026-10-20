import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Emulator } from '../../emu/Emulator'
import type { Clip } from '../../emu/recorder'
import { ReplayPlayer, type ReplayEnd } from '../../emu/ReplayPlayer'
import type { MomentCall, MomentDef, Moments } from '../../sdk/types'
import { LEAD_IN_MS } from './ReplayLeadIn'
import { REPLAY_SPEED } from './runner'
import { useMoments } from './useMoments'

vi.mock('../../emu/ReplayPlayer', () => ({ ReplayPlayer: { start: vi.fn() } }))

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

type D = { n: number; hold?: boolean; stop?: boolean }

const clip: Clip = { from: 0, to: 10, state: new Uint8Array([1]), inputs: new Uint16Array(22), hashes: new Uint32Array(11) }
const rom = new Uint8Array([9])
const start = vi.mocked(ReplayPlayer.start)
let players: FakePlayer[] = []
let clipResult: Clip | null = clip

const emulator = { clip: vi.fn(async () => clipResult) } as unknown as Emulator
const clips = () => vi.mocked(emulator.clip).mock.calls.map(([from]) => from)

const replay = (key: string, subject: string, from: number): MomentCall => ({
  kind: 'replay',
  key,
  subject,
  clip: { from, to: from + 5 },
  label: null,
  colors: { primary: '#111', secondary: '#222' },
  payload: null,
})

const Render = () => null

const def = (id: string, priority: number, when: (d: D) => MomentCall | null): MomentDef<D> => ({ id, priority, when, Render })

const every = (id: string, priority: number, from: number, shared = false) =>
  def(id, priority, (d) => (d.n > 0 ? replay(`${id}:${d.n}`, shared ? `s:${d.n}` : `${id}:${d.n}`, from + d.n) : null))

const fixed = (id: string) => def(id, 1, (d) => (d.n > 0 ? replay(`${id}:${d.n}`, 'same', 400 + d.n) : null))

let manualCount = 0
const manual = def('manual', 2, (d) => replay(`manual:${(manualCount += 1)}`, `s:${d.n}`, 900 + d.n))

const moments = (defs: MomentDef<D>[]): Moments<D> => ({ defs, manual, defer: (d) => d.hold === true, cancel: (d) => d.stop === true })

type Props = { data: D | null; open: boolean; generation?: number; emulator?: Emulator | null; rom?: Uint8Array | null }

function mount(m: Moments<D>, initial: Props) {
  return renderHook((p: Props) => useMoments({ emulator: p.emulator === undefined ? emulator : p.emulator, rom: p.rom === undefined ? rom : p.rom, moments: m, data: p.data, open: p.open, generation: p.generation ?? 0 }), {
    initialProps: initial,
  })
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })

const wait = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })

const due = async () => {
  await flush()
  await wait(LEAD_IN_MS)
  await flush()
}

beforeEach(() => {
  players = []
  clipResult = clip
  start.mockReset()
  start.mockImplementation(async () => {
    const player = new FakePlayer()
    players.push(player)
    return player as unknown as ReplayPlayer
  })
  vi.mocked(emulator.clip).mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('new data queues each call whose key is new in this generation', async () => {
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(clips()).toEqual([101])
  expect(hook.result.current.view?.call.key).toBe('a:1')
  expect(hook.result.current.def?.id).toBe('a')
  act(() => hook.result.current.skip())
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([101])
})

test('mount and a generation change baseline existing keys without replaying them', async () => {
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  hook.rerender({ data: { n: 2 }, open: true, generation: 1 })
  await due()
  expect(hook.result.current.view).toBeNull()
  hook.rerender({ data: { n: 3 }, open: true, generation: 1 })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:3')
  expect(clips()).toEqual([103])
})

test('a generation change ends what is showing, clears the queue and forgets the subjects that ran', async () => {
  const hook = mount(moments([every('a', 2, 100), every('b', 1, 200)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:1')
  hook.rerender({ data: { n: 1 }, open: true, generation: 1 })
  expect(hook.result.current.view).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([101])

  const same = mount(moments([fixed('x')]), { data: { n: 0 }, open: true })
  same.rerender({ data: { n: 1 }, open: true })
  await due()
  act(() => same.result.current.skip())
  same.rerender({ data: { n: 1 }, open: true, generation: 1 })
  same.rerender({ data: { n: 2 }, open: true, generation: 1 })
  await due()
  expect(same.result.current.view?.call.key).toBe('x:2')
})

test('an emulator change baselines existing keys like a generation change', async () => {
  const other = { clip: vi.fn(async () => clip) } as unknown as Emulator
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true, emulator: other })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(other.clip).not.toHaveBeenCalled()
  hook.rerender({ data: { n: 2 }, open: true, emulator: other })
  await due()
  expect(other.clip).toHaveBeenCalledWith(102, 107)
})

test('a rom change baselines existing keys like a generation change', async () => {
  const other = new Uint8Array([7])
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true, rom: other })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(emulator.clip).not.toHaveBeenCalled()
  hook.rerender({ data: { n: 2 }, open: true, rom: other })
  await due()
  expect(emulator.clip).toHaveBeenCalledWith(102, 107)
  expect(start).toHaveBeenCalledWith(emulator, other, clip, expect.any(HTMLCanvasElement), REPLAY_SPEED)
})

test('the highest priority queued call starts first, ties go to the earliest, and defer holds the queue', async () => {
  const hook = mount(moments([every('low', 1, 100), every('high', 2, 200), every('tie', 2, 300)]), { data: { n: 0 }, open: false })
  hook.rerender({ data: { n: 1, hold: true }, open: false })
  hook.rerender({ data: { n: 1, hold: true }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(hook.result.current.waiting).toBe(true)
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('high:1')
  act(() => hook.result.current.skip())
  await due()
  expect(hook.result.current.view?.call.key).toBe('tie:1')
  act(() => hook.result.current.skip())
  await due()
  expect(hook.result.current.view?.call.key).toBe('low:1')
  expect(clips()).toEqual([201, 301, 101])
})

test('a call whose subject already ran in this generation is dropped at the front, even after the window closes or cancel fires', async () => {
  const hook = mount(moments([fixed('x')]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('x:1')
  act(() => hook.result.current.skip())
  hook.rerender({ data: { n: 2 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(hook.result.current.waiting).toBe(false)
  hook.rerender({ data: { n: 2 }, open: false })
  hook.rerender({ data: { n: 3 }, open: false })
  hook.rerender({ data: { n: 3 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  hook.rerender({ data: { n: 3, stop: true }, open: true })
  hook.rerender({ data: { n: 4 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([401])
})

test('closing the window clears the queue and ends what is showing', async () => {
  const hook = mount(moments([every('a', 2, 100), every('b', 1, 200)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:1')
  hook.rerender({ data: { n: 1 }, open: false })
  expect(hook.result.current.view).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([101])
})

test('a call that arrives while the window is closed waits for it to open', async () => {
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: false })
  hook.rerender({ data: { n: 1 }, open: false })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(hook.result.current.waiting).toBe(false)
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:1')
})

test('cancel clears the queue and ends what is showing', async () => {
  const hook = mount(moments([every('a', 2, 100), every('b', 1, 200)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  hook.rerender({ data: { n: 1, stop: true }, open: true })
  expect(hook.result.current.view).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  await due()
  expect(hook.result.current.view).toBeNull()
  hook.rerender({ data: { n: 2, stop: true }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([101])
})

test('call ends what is showing, otherwise launches the manual call at once and records its subject', async () => {
  const hook = mount(moments([every('a', 1, 100, true)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1, hold: true }, open: true })
  act(() => hook.result.current.call())
  await due()
  expect(hook.result.current.def?.id).toBe('manual')
  expect(hook.result.current.view?.call.subject).toBe('s:1')
  act(() => hook.result.current.call())
  expect(hook.result.current.view).toBeNull()
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([901])
  hook.rerender({ data: { n: 1 }, open: false })
  act(() => hook.result.current.call())
  await due()
  expect(hook.result.current.view).toBeNull()
  expect(clips()).toEqual([901])
})

test('skip ends what is showing', async () => {
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.player).toBe(players[0])
  act(() => hook.result.current.view?.skip())
  expect(hook.result.current.view).toBeNull()
  expect(players[0].stop).toHaveBeenCalled()
  act(() => hook.result.current.skip())
  expect(hook.result.current.view).toBeNull()
})

test('waiting covers a queued call with nothing showing and a launched replay without its clip', async () => {
  const hook = mount(moments([every('a', 1, 100)]), { data: { n: 0 }, open: true })
  expect(hook.result.current.waiting).toBe(false)
  hook.rerender({ data: { n: 1, hold: true }, open: true })
  expect(hook.result.current.waiting).toBe(true)
  hook.rerender({ data: { n: 1, hold: true }, open: false })
  expect(hook.result.current.waiting).toBe(false)
  hook.rerender({ data: { n: 2 }, open: false })
  hook.rerender({ data: { n: 2 }, open: true })
  expect(hook.result.current.view).toBeNull()
  expect(hook.result.current.waiting).toBe(true)
  await flush()
  expect(hook.result.current.view?.leadIn).toBe(true)
  expect(hook.result.current.waiting).toBe(false)
  act(() => hook.result.current.skip())
  clipResult = null
  hook.rerender({ data: { n: 3 }, open: true })
  expect(hook.result.current.waiting).toBe(true)
  await flush()
  expect(hook.result.current.waiting).toBe(false)
  expect(hook.result.current.view).toBeNull()
})

test('a newly queued call of at least the showing priority preempts it and a lower one waits', async () => {
  const high = def('a', 2, (d) => (d.n === 1 || d.n >= 3 ? replay(`a:${d.n}`, `a:${d.n}`, 100 + d.n) : null))
  const low = def('c', 1, (d) => (d.n === 2 ? replay('c', 'c', 700) : null))
  const hook = mount(moments([high, low]), { data: { n: 0 }, open: true })
  hook.rerender({ data: { n: 1 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:1')
  hook.rerender({ data: { n: 2 }, open: true })
  await due()
  expect(hook.result.current.view?.call.key).toBe('a:1')
  expect(players[0].stop).not.toHaveBeenCalled()
  hook.rerender({ data: { n: 3 }, open: true })
  await due()
  expect(players[0].stop).toHaveBeenCalled()
  expect(hook.result.current.view?.call.key).toBe('a:3')
  expect(hook.result.current.view?.player).toBe(players[1])
  act(() => hook.result.current.skip())
  await due()
  expect(hook.result.current.view?.call.key).toBe('c')
  hook.rerender({ data: { n: 4 }, open: true })
  await due()
  expect(players[2].stop).toHaveBeenCalled()
  expect(hook.result.current.view?.call.key).toBe('a:4')
  expect(clips()).toEqual([101, 103, 700, 104])
})
