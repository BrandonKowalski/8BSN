import { useEffect, useRef } from 'react'

export type BroadcastButton = 'prevPage' | 'nextPage' | 'replay' | 'restartLastPlay'

const PAD_BUTTONS: readonly (readonly [number, BroadcastButton])[] = [
  [4, 'prevPage'],
  [5, 'nextPage'],
  [6, 'restartLastPlay'],
  [7, 'replay'],
]

const KEYS: Record<string, BroadcastButton> = {
  BracketLeft: 'prevPage',
  BracketRight: 'nextPage',
  Backslash: 'replay',
  Quote: 'restartLastPlay',
}

const THRESHOLD = 0.5

const down = (button: GamepadButton | undefined) => !!button && (typeof button.value === 'number' ? button.value > THRESHOLD : button.pressed)

export function heldButtons(pads: ArrayLike<Gamepad | null>): Set<BroadcastButton> {
  const held = new Set<BroadcastButton>()
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i]
    if (!pad) continue
    for (const [index, button] of PAD_BUTTONS) if (down(pad.buttons[index])) held.add(button)
  }
  return held
}

export function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

const poll = () => heldButtons(navigator.getGamepads?.() ?? [])

export function useBroadcastButtons(onPress: (button: BroadcastButton) => void, enabled: boolean): void {
  const press = useRef(onPress)
  press.current = onPress
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      const button = KEYS[event.code]
      if (!button || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      event.preventDefault()
      press.current(button)
    }
    window.addEventListener('keydown', onKey)
    let held = poll()
    let raf = 0
    const tick = () => {
      const now = poll()
      for (const button of now) if (!held.has(button)) press.current(button)
      held = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [enabled])
}
