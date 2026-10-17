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

  it('toggles view on KeyV and persists it', () => {
    const { result } = renderHook(() => useHotkeys())
    expect(result.current.view).toBe('crt')
    press('KeyV')
    expect(result.current.view).toBe('broadcast')
    expect(JSON.parse(localStorage.getItem('tb.prefs') ?? '{}').view).toBe('broadcast')
  })

  it('restores the view from localStorage', () => {
    localStorage.setItem('tb.prefs', JSON.stringify({ view: 'broadcast', crtStyle: 'console', forcePackage: true }))
    const { result } = renderHook(() => useHotkeys())
    expect(result.current).toEqual({ view: 'broadcast', crtStyle: 'console', forcePackage: true })
  })

  it('toggles crt style and force package', () => {
    const { result } = renderHook(() => useHotkeys())
    press('KeyC')
    press('KeyP')
    expect(result.current.crtStyle).toBe('console')
    expect(result.current.forcePackage).toBe(true)
  })

  it('still toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useHotkeys())
    press('KeyV')
    expect(result.current.view).toBe('broadcast')
  })

  it('ignores modifier combos and typing in inputs', () => {
    const { result } = renderHook(() => useHotkeys())
    press('KeyV', { metaKey: true })
    press('KeyV', { ctrlKey: true })
    press('KeyV', { altKey: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('KeyV', {}, input)
    input.remove()
    expect(result.current.view).toBe('crt')
  })

  it('ignores player keys', () => {
    const { result } = renderHook(() => useHotkeys())
    for (const code of ['ArrowUp', 'KeyX', 'KeyZ', 'Enter', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyJ', 'Space', 'ShiftLeft']) {
      press(code)
    }
    expect(result.current).toEqual({ view: 'crt', crtStyle: 'tube', forcePackage: false })
  })
})
