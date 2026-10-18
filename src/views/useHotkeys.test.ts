import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHotkeys } from './useHotkeys'

const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }))
  })
}

describe('useHotkeys', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('toggles force package on KeyP and persists it', () => {
    const { result } = renderHook(() => useHotkeys())
    expect(result.current.forcePackage).toBe(false)
    press('KeyP')
    expect(result.current.forcePackage).toBe(true)
    expect(JSON.parse(localStorage.getItem('tb.prefs') ?? '{}').forcePackage).toBe(true)
  })

  it('restores prefs from localStorage and drops old view fields', () => {
    localStorage.setItem('tb.prefs', JSON.stringify({ view: 'crt', crtStyle: 'console', forcePackage: true }))
    const { result } = renderHook(() => useHotkeys())
    expect(result.current).toEqual({ forcePackage: true })
  })

  it('still toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useHotkeys())
    press('KeyP')
    expect(result.current.forcePackage).toBe(true)
  })

  it('ignores modifier combos and typing in inputs', () => {
    const { result } = renderHook(() => useHotkeys())
    press('KeyP', { metaKey: true })
    press('KeyP', { ctrlKey: true })
    press('KeyP', { altKey: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('KeyP', {}, input)
    input.remove()
    expect(result.current.forcePackage).toBe(false)
  })

  it('ignores player keys', () => {
    const { result } = renderHook(() => useHotkeys())
    for (const code of ['ArrowUp', 'KeyX', 'KeyZ', 'Enter', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyJ', 'Space', 'ShiftLeft']) {
      press(code)
    }
    expect(result.current).toEqual({ forcePackage: false })
  })
})
