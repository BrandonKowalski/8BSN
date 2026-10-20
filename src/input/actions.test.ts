import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { heldActions, resolveBindings, useActions, type Bindings } from './actions'

let pads: (Gamepad | null)[] = []
let frame: FrameRequestCallback | null = null

const pad = (values: Record<number, number>) =>
  ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (values[i] ?? 0) > 0, value: values[i] ?? 0 })) }) as unknown as Gamepad

beforeEach(() => {
  pads = []
  frame = null
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
  vi.unstubAllGlobals()
})

function mount(bindings: Bindings = resolveBindings(), enabled: (id: string) => boolean = () => true, polling = true) {
  const presses: string[] = []
  const hook = renderHook(
    (props: { enabled: (id: string) => boolean; polling: boolean }) => useActions(bindings, (id) => presses.push(id), props.enabled, props.polling),
    { initialProps: { enabled, polling } },
  )
  const tick = () => act(() => frame?.(0))
  return { presses, hook, tick }
}

const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }))
  })
}

test('defaults bind L1 R1 L2 R2 and the fixed keys', () => {
  const { keys, pad: buttons } = resolveBindings()
  expect([...buttons]).toEqual([
    [4, 'prevPage'],
    [5, 'nextPage'],
    [7, 'replay'],
    [6, 'restart'],
  ])
  expect(Object.fromEntries(keys)).toEqual({
    BracketLeft: 'prevPage',
    BracketRight: 'nextPage',
    Backslash: 'replay',
    Backspace: 'skip',
    Quote: 'restart',
    KeyP: 'forceWindow',
  })
})

test('a package can move a network action to another pad button', () => {
  const { pad: buttons } = resolveBindings({ pad: { replay: [0], prevPage: [] } })
  expect(buttons.get(0)).toBe('replay')
  expect(buttons.has(7)).toBe(false)
  expect(buttons.has(4)).toBe(false)
  expect(buttons.get(5)).toBe('nextPage')
})

test('a package can never move a network key', () => {
  const { keys } = resolveBindings({ actions: [{ id: 'mine', keys: ['KeyP', 'Backslash', 'KeyF', 'Digit1', 'KeyM'] }] })
  expect(keys.get('KeyP')).toBe('forceWindow')
  expect(keys.get('Backslash')).toBe('replay')
  expect(keys.has('KeyF')).toBe(false)
  expect(keys.has('Digit1')).toBe(false)
  expect(keys.get('KeyM')).toBe('mine')
})

test('package actions cannot take a pad button a network action still holds', () => {
  const { pad: buttons } = resolveBindings({ actions: [{ id: 'mine', pad: [4, 2] }] })
  expect(buttons.get(4)).toBe('prevPage')
  expect(buttons.get(2)).toBe('mine')
})

test('package actions can take a pad button freed by remapping', () => {
  const { pad: buttons } = resolveBindings({ pad: { prevPage: [] }, actions: [{ id: 'mine', pad: [4] }] })
  expect(buttons.get(4)).toBe('mine')
})

test('earlier package actions win over later ones', () => {
  const { keys, pad: buttons } = resolveBindings({
    actions: [
      { id: 'first', keys: ['KeyM'], pad: [2] },
      { id: 'second', keys: ['KeyM'], pad: [2] },
    ],
  })
  expect(keys.get('KeyM')).toBe('first')
  expect(buttons.get(2)).toBe('first')
})

test('L1, R1, L2 and R2 map to the network actions and the triggers need more than half travel', () => {
  const { pad: buttons } = resolveBindings()
  expect([...heldActions([pad({ 4: 1, 5: 1 })], buttons)]).toEqual(['prevPage', 'nextPage'])
  expect([...heldActions([pad({ 6: 0.4, 7: 0.5 })], buttons)]).toEqual([])
  expect([...heldActions([null, pad({ 6: 0.6, 7: 0.9 })], buttons)]).toEqual(['replay', 'restart'])
  expect([...heldActions([pad({ 0: 1, 1: 1, 8: 1, 9: 1, 12: 1, 13: 1, 14: 1, 15: 1 })], buttons)]).toEqual([])
})

test('actions fire on pad rising edges only', () => {
  const { presses, tick } = mount()
  tick()
  pads = [pad({ 5: 1 })]
  tick()
  tick()
  expect(presses).toEqual(['nextPage'])
  pads = [pad({})]
  tick()
  pads = [pad({ 4: 1, 7: 1 })]
  tick()
  expect(presses).toEqual(['nextPage', 'prevPage', 'replay'])
})

test('a button already held when the poller starts does not fire', () => {
  pads = [pad({ 7: 1 })]
  const { presses, tick } = mount()
  tick()
  expect(presses).toEqual([])
  pads = [pad({})]
  tick()
  pads = [pad({ 7: 1 })]
  tick()
  expect(presses).toEqual(['replay'])
})

test('the keyboard twins fire the same actions', () => {
  const { presses } = mount()
  for (const code of ['BracketLeft', 'BracketRight', 'Backslash', 'Backspace', 'Quote', 'KeyP', 'KeyX']) press(code)
  press('Backslash', { repeat: true })
  press('Backslash', { ctrlKey: true })
  press('Backslash', { metaKey: true })
  press('Backslash', { altKey: true })
  expect(presses).toEqual(['prevPage', 'nextPage', 'replay', 'skip', 'restart', 'forceWindow'])
})

test('typing in an input does not fire actions', () => {
  const { presses } = mount()
  const input = document.createElement('input')
  document.body.appendChild(input)
  press('KeyP', {}, input)
  press('Backspace', {}, input)
  input.remove()
  expect(presses).toEqual([])
})

test('actions that are not enabled do not fire from the keyboard or the pad', () => {
  const { presses, hook, tick } = mount(resolveBindings(), (id) => id === 'forceWindow')
  expect(frame).not.toBeNull()
  tick()
  pads = [pad({ 4: 1 })]
  tick()
  press('BracketRight')
  press('KeyP')
  expect(presses).toEqual(['forceWindow'])
  hook.rerender({ enabled: () => true, polling: true })
  tick()
  expect(presses).toEqual(['forceWindow'])
})

test('package actions fire by their own id', () => {
  const { presses, tick } = mount(resolveBindings({ actions: [{ id: 'mine', keys: ['KeyM'], pad: [2] }] }))
  tick()
  press('KeyM')
  pads = [pad({ 2: 1 })]
  tick()
  expect(presses).toEqual(['mine', 'mine'])
})

test('the pad is not polled while polling is off and a held button does not fire when it starts', () => {
  const { presses, hook, tick } = mount(resolveBindings(), () => true, false)
  expect(frame).toBeNull()
  press('KeyP')
  expect(presses).toEqual(['forceWindow'])
  pads = [pad({ 7: 1 })]
  hook.rerender({ enabled: () => true, polling: true })
  tick()
  expect(presses).toEqual(['forceWindow'])
})
