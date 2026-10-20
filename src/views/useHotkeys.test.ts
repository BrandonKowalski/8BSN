import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForceWindow, useHotkeys } from './useHotkeys'

describe('useForceWindow', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('toggles and persists force window', () => {
    const { result } = renderHook(() => useForceWindow())
    expect(result.current[0]).toBe(false)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
    expect(JSON.parse(localStorage.getItem('tb.prefs') ?? '{}').forcePackage).toBe(true)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
    expect(JSON.parse(localStorage.getItem('tb.prefs') ?? '{}').forcePackage).toBe(false)
  })

  it('restores prefs from localStorage and drops old view fields', () => {
    localStorage.setItem('tb.prefs', JSON.stringify({ view: 'crt', crtStyle: 'console', forcePackage: true }))
    const { result } = renderHook(() => useForceWindow())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1]())
    expect(JSON.parse(localStorage.getItem('tb.prefs') ?? '{}')).toEqual({ forcePackage: false })
  })

  it('still toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useForceWindow())
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
  })
})

describe('useHotkeys', () => {
  afterEach(() => vi.restoreAllMocks())

  const press = (code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }))
    })
  }

  it('toggles fullscreen on KeyF but not with modifiers or while typing', () => {
    const request = vi.fn(() => Promise.resolve())
    document.documentElement.requestFullscreen = request
    renderHook(() => useHotkeys())
    press('KeyF', { metaKey: true })
    press('KeyF', { repeat: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('KeyF', {}, input)
    input.remove()
    expect(request).not.toHaveBeenCalled()
    press('KeyF')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not handle KeyP', () => {
    localStorage.clear()
    const { result } = renderHook(() => useForceWindow())
    renderHook(() => useHotkeys())
    press('KeyP')
    expect(result.current[0]).toBe(false)
  })
})
