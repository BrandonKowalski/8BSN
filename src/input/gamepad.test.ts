import { describe, expect, it } from 'vitest'
import { Btn } from './buttons'
import { PadSlots, padToMask } from './gamepad'

type FakePad = Pick<Gamepad, 'buttons' | 'axes' | 'id' | 'index' | 'connected'>

function fakePad(index: number, pressed: number[] = [], axes: number[] = [0, 0, 0, 0], id = 'Pad'): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    touched: pressed.includes(i),
    value: pressed.includes(i) ? 1 : 0,
  }))
  const pad: FakePad = { buttons, axes, id, index, connected: true }
  return pad as unknown as Gamepad
}

describe('padToMask', () => {
  it('maps buttons 1 and 9 to A and START', () => {
    expect(padToMask(fakePad(0, [1, 9]))).toBe(Btn.A | Btn.START)
  })

  it('maps buttons 0, 8 and the dpad', () => {
    expect(padToMask(fakePad(0, [0, 8, 12, 13, 14, 15]))).toBe(
      Btn.B | Btn.SELECT | Btn.UP | Btn.DOWN | Btn.LEFT | Btn.RIGHT,
    )
  })

  it('maps stick axes beyond the deadzone', () => {
    expect(padToMask(fakePad(0, [], [0.7, -0.6]))).toBe(Btn.RIGHT | Btn.UP)
    expect(padToMask(fakePad(0, [], [-0.7, 0.6]))).toBe(Btn.LEFT | Btn.DOWN)
  })

  it('ignores stick inside the deadzone', () => {
    expect(padToMask(fakePad(0, [], [0.3, 0]))).toBe(0)
  })

  it('tolerates short button and axis arrays', () => {
    expect(padToMask({ buttons: [], axes: [] })).toBe(0)
  })
})

describe('PadSlots', () => {
  it('gives two pads two non-zero slots', () => {
    const slots = new PadSlots()
    const [p1, p2] = slots.update([fakePad(0, [0]), fakePad(1, [1])])
    expect(p1).toBe(Btn.B)
    expect(p2).toBe(Btn.A)
  })

  it('zeroes a removed pad and keeps the other', () => {
    const slots = new PadSlots()
    slots.update([fakePad(0, [0]), fakePad(1, [1])])
    expect(slots.update([null, fakePad(1, [1])])).toEqual([0, Btn.A])
  })

  it('restores a reconnected pad to its old slot', () => {
    const slots = new PadSlots()
    slots.update([fakePad(0, [0]), fakePad(1, [1])])
    slots.update([null, fakePad(1, [1])])
    expect(slots.update([fakePad(0, [0]), fakePad(1, [1])])).toEqual([Btn.B, Btn.A])
  })

  it('fills the first empty slot and keeps it stable when another pad joins', () => {
    const slots = new PadSlots()
    expect(slots.update([null, fakePad(1, [1])])).toEqual([Btn.A, 0])
    expect(slots.update([fakePad(0, [0]), fakePad(1, [1])])).toEqual([Btn.A, Btn.B])
  })

  it('treats a disconnected pad object as absent', () => {
    const slots = new PadSlots()
    const pad = fakePad(0, [0])
    slots.update([pad])
    const gone = { ...pad, connected: false } as unknown as Gamepad
    expect(slots.update([gone])).toEqual([0, 0])
  })

  it('handles empty and missing lists', () => {
    const slots = new PadSlots()
    expect(slots.update([])).toEqual([0, 0])
    expect(slots.update([null, null, null])).toEqual([0, 0])
  })

  it('distinguishes pads by id and index', () => {
    const slots = new PadSlots()
    const a = fakePad(0, [0], undefined, 'A')
    const b = fakePad(1, [1], undefined, 'B')
    slots.update([a, b])
    expect(slots.update([b, a])).toEqual([Btn.B, Btn.A])
  })
})
