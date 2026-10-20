import { useEffect, useRef } from 'react'
import type { Controls, NetworkAction } from '../sdk/types'

export const NETWORK_KEYS: Record<NetworkAction, readonly string[]> = {
  prevPage: ['BracketLeft'],
  nextPage: ['BracketRight'],
  replay: ['Backslash'],
  skip: ['Backspace'],
  restart: ['Quote'],
  forceWindow: ['KeyP'],
}

export const NETWORK_PAD: Record<NetworkAction, readonly number[]> = {
  prevPage: [4],
  nextPage: [5],
  restart: [6],
  replay: [7],
  skip: [],
  forceWindow: [],
}

export const RESERVED_KEYS: readonly string[] = [...Object.values(NETWORK_KEYS).flat(), 'KeyF', 'KeyR', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4']

export type Bindings = { keys: ReadonlyMap<string, string>; pad: ReadonlyMap<number, string> }

const ACTIONS = Object.keys(NETWORK_KEYS) as NetworkAction[]

export function resolveBindings(controls?: Controls): Bindings {
  const keys = new Map<string, string>()
  const pad = new Map<number, string>()
  for (const action of ACTIONS) {
    for (const key of NETWORK_KEYS[action]) keys.set(key, action)
    for (const button of controls?.pad?.[action] ?? NETWORK_PAD[action]) if (!pad.has(button)) pad.set(button, action)
  }
  for (const action of controls?.actions ?? []) {
    for (const key of action.keys ?? []) if (!RESERVED_KEYS.includes(key) && !keys.has(key)) keys.set(key, action.id)
    for (const button of action.pad ?? []) if (!pad.has(button)) pad.set(button, action.id)
  }
  return { keys, pad }
}

const THRESHOLD = 0.5

const down = (button: GamepadButton | undefined) => !!button && (typeof button.value === 'number' ? button.value > THRESHOLD : button.pressed)

export function heldActions(pads: ArrayLike<Gamepad | null>, bindings: ReadonlyMap<number, string>): Set<string> {
  const held = new Set<string>()
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i]
    if (!pad) continue
    for (const [index, id] of bindings) if (down(pad.buttons[index])) held.add(id)
  }
  return held
}

export function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function useActions(bindings: Bindings, onAction: (id: string) => void, enabled: (id: string) => boolean, polling = true): void {
  const act = useRef(onAction)
  act.current = onAction
  const allowed = useRef(enabled)
  allowed.current = enabled
  useEffect(() => {
    const poll = () => heldActions(navigator.getGamepads?.() ?? [], bindings.pad)
    const onKey = (event: KeyboardEvent) => {
      const id = bindings.keys.get(event.code)
      if (!id || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || typing(document.activeElement) || !allowed.current(id)) return
      event.preventDefault()
      act.current(id)
    }
    window.addEventListener('keydown', onKey)
    if (!polling) return () => window.removeEventListener('keydown', onKey)
    let held = poll()
    let raf = 0
    const tick = () => {
      const now = poll()
      for (const id of now) if (!held.has(id) && allowed.current(id)) act.current(id)
      held = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [bindings, polling])
}
