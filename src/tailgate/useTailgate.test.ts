import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { scriptEnd } from '../emu/autoplay'
import type { Emulator } from '../emu/Emulator'
import type { Press, Snapshot, Tailgate, TailgatePick } from '../sdk/types'
import { CAP_MS, SETTLE_MS, TAIL_MS, useTailgate, useTailgateHold, type TailgateInput } from './useTailgate'

type View = { done: boolean }

const SCRIPT: Press[] = [{ at: 10, mask: 8 }]
const END = scriptEnd(SCRIPT)

function fakeEmulator() {
  const frame = { at: 100, status: 0 }
  const emulator = {
    autoplay: vi.fn(),
    setHumanInput: vi.fn(),
    setAutoInput: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    readSnapshot: (into: Snapshot) => {
      into.frame = frame.at
      into.ram[0] = frame.status
      return true
    },
  }
  return { emulator: emulator as unknown as Emulator & typeof emulator, frame }
}

const spec = (over: Partial<Tailgate<View>> = {}): Tailgate<View> => ({
  label: 'GO',
  script: vi.fn(() => SCRIPT),
  autoInput: (snap, at) => [snap.ram[0] === 1 ? at : 0, 0],
  hold: () => false,
  holdMs: () => 0,
  finished: (d) => d.done,
  ...over,
})

const pick: TailgatePick = { games: null, toRom: (a) => a, sha1: 'abc', random: () => 0 }

type Props = { active: boolean; asking?: boolean; data?: View; onFinal?: () => void; onInput?: (input: TailgateInput) => void; tailgate?: Tailgate<View> }

function mount(emulator: Emulator, initial: Props) {
  return renderHook(
    ({ active, asking = false, data = { done: false }, onFinal = () => undefined, onInput = () => undefined, tailgate }: Props) =>
      useTailgate({ emulator, spec: tailgate, data, pick, active, asking, onFinal, onInput }),
    { initialProps: initial },
  )
}

const frame = () => act(() => vi.advanceTimersToNextFrame())

const clock = { now: 0 }
const settle = () => {
  clock.now += SETTLE_MS
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  clock.now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('starting sends the package script from the pick and mutes the player, stopping hands control back', () => {
  const { emulator } = fakeEmulator()
  const tailgate = spec()
  const { rerender } = mount(emulator, { active: false, tailgate })
  expect(emulator.autoplay).not.toHaveBeenCalled()
  rerender({ active: true, tailgate })
  expect(tailgate.script).toHaveBeenCalledWith(pick)
  expect(emulator.autoplay).toHaveBeenCalledWith(SCRIPT)
  expect(emulator.setHumanInput).toHaveBeenCalledWith(false)
  rerender({ active: false, tailgate })
  expect(emulator.autoplay).toHaveBeenLastCalledWith(null)
  expect(emulator.setAutoInput).toHaveBeenLastCalledWith([0, 0])
  expect(emulator.setHumanInput).toHaveBeenLastCalledWith(true)
})

test('without a package tailgate nothing starts', () => {
  const { emulator } = fakeEmulator()
  mount(emulator, { active: true })
  frame()
  expect(emulator.autoplay).not.toHaveBeenCalled()
  expect(emulator.setHumanInput).not.toHaveBeenCalled()
})

test('auto input comes from the package only once the script has ended', () => {
  const { emulator, frame: at } = fakeEmulator()
  at.status = 1
  mount(emulator, { active: true, tailgate: spec() })
  frame()
  expect(emulator.setAutoInput).toHaveBeenLastCalledWith([0, 0])
  at.at = 100 + END - 1
  frame()
  expect(emulator.setAutoInput).toHaveBeenLastCalledWith([0, 0])
  at.at = 100 + END
  frame()
  expect(emulator.setAutoInput).toHaveBeenLastCalledWith([END, 0])
})

test('a package without auto input leaves both pads idle', () => {
  const { emulator, frame: at } = fakeEmulator()
  mount(emulator, { active: true, tailgate: spec({ autoInput: undefined }) })
  frame()
  at.at = 100 + END + 50
  frame()
  expect(emulator.setAutoInput).toHaveBeenLastCalledWith([0, 0])
})

test('the end of a game is reported once', () => {
  const { emulator } = fakeEmulator()
  const onFinal = vi.fn()
  const tailgate = spec()
  const { rerender } = mount(emulator, { active: true, tailgate, onFinal })
  frame()
  expect(onFinal).not.toHaveBeenCalled()
  rerender({ active: true, tailgate, onFinal, data: { done: true } })
  frame()
  frame()
  rerender({ active: true, tailgate, onFinal, data: { done: true } })
  frame()
  expect(onFinal).toHaveBeenCalledTimes(1)
})

test('input settles before it counts, and keys are swallowed', () => {
  const { emulator } = fakeEmulator()
  const onInput = vi.fn()
  mount(emulator, { active: true, tailgate: spec(), onInput })
  const early = new KeyboardEvent('keydown', { code: 'KeyX', cancelable: true })
  act(() => {
    window.dispatchEvent(early)
  })
  expect(early.defaultPrevented).toBe(true)
  expect(onInput).not.toHaveBeenCalled()
  settle()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', repeat: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }))
  })
  expect(onInput).toHaveBeenCalledTimes(1)
  expect(onInput).toHaveBeenCalledWith({ kind: 'key', code: 'KeyX' })
})

test('pad buttons count on the press once settled', () => {
  const { emulator } = fakeEmulator()
  const onInput = vi.fn()
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }))
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ buttons }] })
  mount(emulator, { active: true, tailgate: spec(), onInput })
  buttons[0].pressed = true
  frame()
  expect(onInput).not.toHaveBeenCalled()
  buttons[0].pressed = false
  settle()
  frame()
  buttons[9].pressed = true
  frame()
  frame()
  expect(onInput).toHaveBeenCalledTimes(1)
  expect(onInput).toHaveBeenCalledWith({ kind: 'pad', button: 9 })
  Reflect.deleteProperty(navigator, 'getGamepads')
})

test('a pointer press and its click are swallowed unless the leave question is up', () => {
  const { emulator } = fakeEmulator()
  const onInput = vi.fn()
  const tailgate = spec()
  const { rerender } = mount(emulator, { active: true, tailgate, onInput })
  settle()
  const down = new Event('pointerdown', { cancelable: true })
  const click = new Event('click', { cancelable: true })
  act(() => {
    window.dispatchEvent(down)
    window.dispatchEvent(click)
  })
  expect(down.defaultPrevented).toBe(true)
  expect(click.defaultPrevented).toBe(true)
  expect(onInput).toHaveBeenCalledWith({ kind: 'pointer' })
  rerender({ active: true, tailgate, onInput, asking: true })
  const asked = new Event('pointerdown', { cancelable: true })
  act(() => {
    window.dispatchEvent(asked)
  })
  expect(asked.defaultPrevented).toBe(false)
  expect(onInput).toHaveBeenCalledTimes(1)
})

const holdCount = (emulator: Emulator) => vi.mocked(emulator.pause).mock.calls.length - vi.mocked(emulator.resume).mock.calls.length

test('a tailgate hold with a replay lets go one second after the replay ends', () => {
  const { emulator } = fakeEmulator()
  const { rerender } = renderHook(({ holding, replaying }) => useTailgateHold(emulator, holding, replaying, 4000), { initialProps: { holding: true, replaying: true } })
  act(() => vi.advanceTimersByTime(9000))
  expect(holdCount(emulator)).toBe(1)
  rerender({ holding: true, replaying: false })
  act(() => vi.advanceTimersByTime(TAIL_MS - 1))
  expect(holdCount(emulator)).toBe(1)
  act(() => vi.advanceTimersByTime(1))
  expect(holdCount(emulator)).toBe(0)
})

test('a tailgate hold without a replay lasts the last play graphic plus one second', () => {
  const { emulator } = fakeEmulator()
  renderHook(() => useTailgateHold(emulator, true, false, 2500))
  act(() => vi.advanceTimersByTime(2500 + TAIL_MS - 1))
  expect(holdCount(emulator)).toBe(1)
  act(() => vi.advanceTimersByTime(1))
  expect(holdCount(emulator)).toBe(0)
})

test('a tailgate hold never outlasts the cap', () => {
  const { emulator } = fakeEmulator()
  renderHook(() => useTailgateHold(emulator, true, true, 2500))
  act(() => vi.advanceTimersByTime(CAP_MS - 1))
  expect(holdCount(emulator)).toBe(1)
  act(() => vi.advanceTimersByTime(1))
  expect(holdCount(emulator)).toBe(0)
})
