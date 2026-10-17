import { afterEach, describe, expect, it } from 'vitest'
import { Btn } from './buttons'
import { KeyboardInput } from './keyboard'

let input: KeyboardInput | null = null

afterEach(() => {
  input?.dispose()
  input = null
})

function key(type: string, code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent(type, { code, cancelable: true, ...init })
}

describe('KeyboardInput', () => {
  it('maps KeyX to P1 A', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'KeyX'))
    expect(input.masks()).toEqual([Btn.A, 0])
  })

  it('maps P2 keys', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'KeyW'))
    window.dispatchEvent(key('keydown', 'Space'))
    expect(input.masks()).toEqual([0, Btn.UP | Btn.START])
  })

  it('maps arrows and shift keys', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'ArrowLeft'))
    window.dispatchEvent(key('keydown', 'ShiftRight'))
    window.dispatchEvent(key('keydown', 'ShiftLeft'))
    expect(input.masks()).toEqual([Btn.LEFT | Btn.SELECT, Btn.SELECT])
  })

  it('releases on keyup', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'KeyZ'))
    window.dispatchEvent(key('keyup', 'KeyZ'))
    expect(input.masks()).toEqual([0, 0])
  })

  it('clears everything on blur', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'KeyX'))
    window.dispatchEvent(key('keydown', 'KeyJ'))
    window.dispatchEvent(new Event('blur'))
    expect(input.masks()).toEqual([0, 0])
  })

  it('prevents default for mapped keys only', () => {
    input = new KeyboardInput(window)
    const mapped = key('keydown', 'ArrowDown')
    const other = key('keydown', 'KeyQ')
    window.dispatchEvent(mapped)
    window.dispatchEvent(other)
    expect(mapped.defaultPrevented).toBe(true)
    expect(other.defaultPrevented).toBe(false)
  })

  it('keeps a key held across repeat events', () => {
    input = new KeyboardInput(window)
    window.dispatchEvent(key('keydown', 'KeyX'))
    window.dispatchEvent(key('keydown', 'KeyX', { repeat: true }))
    expect(input.masks()).toEqual([Btn.A, 0])
  })

  it('stops listening after dispose', () => {
    input = new KeyboardInput(window)
    input.dispose()
    window.dispatchEvent(key('keydown', 'KeyX'))
    expect(input.masks()).toEqual([0, 0])
  })
})
