import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../../game/types'

export const POSSESSION_SETTLE_MS = 1500

type Settle = { shown: 0 | 1; pending: 0 | 1 | null; since: number }

const kickoffInAir = (state: GameState) => state.playKind === 'kickoff' && state.ballInAir !== null

export function settlePossession(prev: Settle | null, state: GameState, now: number): Settle {
  if (!prev) return { shown: state.possession, pending: null, since: now }
  if (state.possession === prev.shown) return prev.pending === null ? prev : { ...prev, pending: null }
  const since = prev.pending === state.possession ? prev.since : now
  if (now - since >= POSSESSION_SETTLE_MS && !kickoffInAir(state)) return { shown: state.possession, pending: null, since: now }
  return { shown: prev.shown, pending: state.possession, since }
}

export function useSettledPossession(state: GameState | null): 0 | 1 | null {
  const settle = useRef<Settle | null>(null)
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!state) return
    const step = () => {
      const before = settle.current?.shown
      settle.current = settlePossession(settle.current, state, Date.now())
      if (settle.current.shown !== before) redraw((n) => n + 1)
    }
    step()
    if (settle.current?.pending == null) return
    const timer = setTimeout(step, Math.max(0, settle.current.since + POSSESSION_SETTLE_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [state])
  if (!state) return null
  return settle.current?.shown ?? state.possession
}
