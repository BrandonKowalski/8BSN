import { useRef } from 'react'
import { lastQuarter } from '../game/format'
import type { GameState } from '../game/types'

export function useEndedQuarter(state: GameState | null, fallback: number | null = state && lastQuarter(state)): number | null {
  const seen = useRef<number | null>(null)
  if (state?.inGame) seen.current = state.quarter
  return seen.current ?? fallback
}
