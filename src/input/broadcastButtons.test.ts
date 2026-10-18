import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { heldButtons, useBroadcastButtons, type BroadcastButton } from './broadcastButtons'

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

function mount(enabled = true) {
  const presses: BroadcastButton[] = []
  const hook = renderHook((props: { enabled: boolean }) => useBroadcastButtons((b) => presses.push(b), props.enabled), { initialProps: { enabled } })
  const tick = () => act(() => frame?.(0))
  return { presses, hook, tick }
}

test('L1, R1, L2 and R2 map to the broadcast buttons and the triggers need more than half travel', () => {
  expect([...heldButtons([pad({ 4: 1, 5: 1 })])]).toEqual(['prevPage', 'nextPage'])
  expect([...heldButtons([pad({ 6: 0.4, 7: 0.5 })])]).toEqual([])
  expect([...heldButtons([null, pad({ 6: 0.6, 7: 0.9 })])]).toEqual(['restartLastPlay', 'replay'])
  expect([...heldButtons([pad({ 0: 1, 1: 1, 8: 1, 9: 1, 12: 1, 13: 1, 14: 1, 15: 1 })])]).toEqual([])
})

test('a button fires once on the rising edge', () => {
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

test('the keyboard twins fire the same buttons', () => {
  const { presses } = mount()
  for (const code of ['BracketLeft', 'BracketRight', 'Backslash', 'Quote', 'KeyX']) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }))
    })
  }
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash', repeat: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backslash', ctrlKey: true }))
  })
  expect(presses).toEqual(['prevPage', 'nextPage', 'replay', 'restartLastPlay'])
})

test('nothing fires while disabled', () => {
  const { presses, hook, tick } = mount(false)
  expect(frame).toBeNull()
  pads = [pad({ 4: 1 })]
  tick()
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight' }))
  })
  expect(presses).toEqual([])
  hook.rerender({ enabled: true })
  tick()
  expect(presses).toEqual([])
})
