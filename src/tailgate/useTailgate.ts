import { useEffect, useRef } from 'react'
import { scriptEnd } from '../emu/autoplay'
import type { Emulator } from '../emu/Emulator'
import { emptySnapshot } from '../emu/snapshot'
import type { Tailgate, TailgatePick } from '../sdk/types'

export const SETTLE_MS = 500
export const TAIL_MS = 1000
export const CAP_MS = 30000

type Options<S> = {
  emulator: Emulator | null
  spec: Tailgate<S> | undefined
  data: S | null
  pick: TailgatePick | null
  active: boolean
  asking: boolean
  onFinal: () => void
  onInput: (input: TailgateInput) => void
}

export type TailgateInput = { kind: 'key'; code: string } | { kind: 'pad'; button: number } | { kind: 'pointer' }

export function useTailgate<S>({ emulator, spec, data, pick, asking, active, onFinal, onInput }: Options<S>): void {
  const pickRef = useRef(pick)
  pickRef.current = pick
  const dataRef = useRef(data)
  dataRef.current = data
  const finalRef = useRef(onFinal)
  finalRef.current = onFinal
  const inputRef = useRef(onInput)
  inputRef.current = onInput
  const askingRef = useRef(asking)
  askingRef.current = asking

  useEffect(() => {
    const pick = pickRef.current
    if (!active || !emulator || !spec || !pick) return
    const script = spec.script(pick)
    const end = scriptEnd(script)
    const snap = emptySnapshot()
    let origin: number | null = null
    let done = false
    let raf = 0
    emulator.autoplay(script)
    emulator.setHumanInput(false)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!emulator.readSnapshot(snap)) return
      origin ??= snap.frame
      const at = snap.frame - origin
      emulator.setAutoInput(at < end ? [0, 0] : (spec.autoInput?.(snap, at) ?? [0, 0]))
      const data = dataRef.current
      if (!done && data !== null && spec.finished(data)) {
        done = true
        finalRef.current()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      emulator.autoplay(null)
      emulator.setAutoInput([0, 0])
      emulator.setHumanInput(true)
    }
  }, [active, emulator, spec])

  useEffect(() => {
    if (!active) return
    const swallow = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const from = performance.now()
    const settled = () => performance.now() - from >= SETTLE_MS
    const onKey = (event: KeyboardEvent) => {
      swallow(event)
      if (!event.repeat && settled()) inputRef.current({ kind: 'key', code: event.code })
    }
    const onPointer = (event: Event) => {
      if (askingRef.current) return
      swallow(event)
      window.addEventListener('click', swallow, { capture: true, once: true })
      if (settled()) inputRef.current({ kind: 'pointer' })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    const held = () => {
      const now = new Set<number>()
      for (const pad of navigator.getGamepads?.() ?? []) pad?.buttons.forEach((button, index) => button.pressed && now.add(index))
      return now
    }
    let raf = 0
    let was = held()
    const poll = () => {
      const now = held()
      if (settled()) for (const index of now) if (!was.has(index)) inputRef.current({ kind: 'pad', button: index })
      was = now
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
      cancelAnimationFrame(raf)
    }
  }, [active])
}

export function useTailgateHold(emulator: Emulator | null, holding: boolean, covered: boolean, holdMs: number) {
  const releaseRef = useRef<(() => void) | null>(null)
  const replayedRef = useRef(false)
  const coveredRef = useRef(covered)
  coveredRef.current = covered
  if (holding && covered) replayedRef.current = true
  useEffect(() => {
    if (!holding || !emulator) return
    emulator.pause()
    replayedRef.current = coveredRef.current
    let held = true
    const release = () => {
      if (!held) return
      held = false
      clearTimeout(cap)
      releaseRef.current = null
      emulator.resume()
    }
    const cap = setTimeout(release, CAP_MS)
    releaseRef.current = release
    return release
  }, [holding, emulator])
  useEffect(() => {
    if (!holding || covered) return
    const wait = (replayedRef.current ? 0 : holdMs) + TAIL_MS
    const timer = setTimeout(() => releaseRef.current?.(), wait)
    return () => clearTimeout(timer)
  }, [holding, covered, holdMs])
}
