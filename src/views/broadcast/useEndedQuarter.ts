import { useRef } from 'react'
import type { GameState } from '../../game/types'

export function useEndedQuarter(state: GameState | null, fallback: number | null = null): number | null {
  const seen = useRef<number | null>(null)
  if (state?.inGame) seen.current = state.quarter
  return seen.current ?? fallback
}
