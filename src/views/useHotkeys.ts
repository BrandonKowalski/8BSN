import { useCallback, useEffect, useState } from 'react'
import { typing } from '../input/actions'

export type Prefs = { forcePackage: boolean }

const KEY = 'tb.prefs'
const DEFAULTS: Prefs = { forcePackage: false }

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return { forcePackage: parsed.forcePackage === true }
  } catch {
    return DEFAULTS
  }
}

function save(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    return
  }
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()?.catch(() => undefined)
  } catch {
    return
  }
}

export function useForceWindow(): [boolean, () => void] {
  const [prefs, setPrefs] = useState<Prefs>(load)
  const toggle = useCallback(
    () =>
      setPrefs((current) => {
        const next = { ...current, forcePackage: !current.forcePackage }
        save(next)
        return next
      }),
    [],
  )
  return [prefs.forcePackage, toggle]
}

export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (typing(event.target) || typing(document.activeElement)) return
      if (event.code === 'KeyF') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
