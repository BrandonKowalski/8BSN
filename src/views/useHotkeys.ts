import { useEffect, useState } from 'react'

export type ViewMode = 'crt' | 'broadcast'
export type CrtStyle = 'tube' | 'console'
export type Prefs = { view: ViewMode; crtStyle: CrtStyle; forcePackage: boolean }

const KEY = 'tb.prefs'
const DEFAULTS: Prefs = { view: 'crt', crtStyle: 'tube', forcePackage: false }

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      view: parsed.view === 'broadcast' ? 'broadcast' : 'crt',
      crtStyle: parsed.crtStyle === 'console' ? 'console' : 'tube',
      forcePackage: parsed.forcePackage === true,
    }
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

function typing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useHotkeys(): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (typing(event.target) || typing(document.activeElement)) return
      const update = (change: (p: Prefs) => Prefs) =>
        setPrefs((current) => {
          const next = change(current)
          save(next)
          return next
        })
      switch (event.code) {
        case 'KeyV':
          update((p) => ({ ...p, view: p.view === 'crt' ? 'broadcast' : 'crt' }))
          break
        case 'KeyC':
          update((p) => ({ ...p, crtStyle: p.crtStyle === 'tube' ? 'console' : 'tube' }))
          break
        case 'KeyP':
          update((p) => ({ ...p, forcePackage: !p.forcePackage }))
          break
        case 'KeyF':
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return prefs
}
