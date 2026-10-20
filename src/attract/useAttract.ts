import { useEffect, useRef } from 'react'
import { HOLD_FRAMES, scriptEnd } from '../emu/autoplay'
import type { Emulator } from '../emu/Emulator'
import { emptySnapshot } from '../emu/snapshot'
import { Btn } from '../input/buttons'
import { onAir } from '../game/format'
import { TSB2026_MAP } from '../game/maps/tsb2026'
import type { GameState } from '../game/types'
import type { LeagueGame } from '../league/espn'
import { pickMatchup, randomCells } from './matchup'
import { attractScript } from './script'

export const NUDGE_FRAMES = 240
export const SETTLE_MS = 500
const COLUMNS = 4
const ROWS = 8

export function nudgeMask(frame: number, inBreak: boolean): number {
  return inBreak && frame % NUDGE_FRAMES < HOLD_FRAMES ? Btn.START : 0
}

type Options = {
  emulator: Emulator | null
  state: GameState | null
  aftershow: GameState | null
  games: readonly LeagueGame[] | null
  grid: readonly string[] | undefined
  active: boolean
  asking: boolean
  onFinal: () => void
  onInput: (input: AttractInput) => void
}

export type AttractInput = { kind: 'key'; code: string } | { kind: 'pad'; button: number } | { kind: 'pointer' }

export function useAttract({ emulator, state, aftershow, games, grid, asking, active, onFinal, onInput }: Options): void {
  const pickRef = useRef({ games, grid })
  pickRef.current = { games, grid }
  const stateRef = useRef(state)
  stateRef.current = state
  const aftershowRef = useRef(aftershow)
  aftershowRef.current = aftershow
  const finalRef = useRef(onFinal)
  finalRef.current = onFinal
  const inputRef = useRef(onInput)
  inputRef.current = onInput
  const askingRef = useRef(asking)
  askingRef.current = asking

  useEffect(() => {
    if (!active || !emulator) return
    const { games, grid } = pickRef.current
    const script = attractScript(pickMatchup(games, grid)?.cells ?? randomCells(COLUMNS, ROWS))
    const end = scriptEnd(script)
    const snap = emptySnapshot()
    const map = TSB2026_MAP
    let origin: number | null = null
    let started = false
    let done = false
    let raf = 0
    emulator.autoplay(script)
    emulator.setHumanInput(false)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!emulator.readSnapshot(snap)) return
      origin ??= snap.frame
      const at = snap.frame - origin
      const status = snap.ram[map.gameStatus.offset] ?? 0
      if (stateRef.current?.inGame) started = true
      emulator.setAutoInput([at < end ? 0 : nudgeMask(at, status === map.breakValue), 0])
      if (started && !done && !onAir(stateRef.current) && !aftershowRef.current) {
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
  }, [active, emulator])

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
