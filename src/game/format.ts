import type { GameState, TeamState } from './types'

const ORDINALS = ['1ST', '2ND', '3RD', '4TH']

export function formatClock(c: { min: number; sec: number }): string {
  return `${c.min}:${String(c.sec).padStart(2, '0')}`
}

export function formatQuarter(q: number): string {
  return q >= 4 ? 'OT' : ORDINALS[Math.max(0, q)]
}

export function formatDownDistance(down: number, togo: number): string {
  const ordinal = ORDINALS[Math.min(Math.max(down, 1), 4) - 1]
  return togo <= 0 ? `${ordinal} & GOAL` : `${ordinal} & ${togo}`
}

export function formatBallOn(b: GameState['ballOn'], teams: [TeamState, TeamState]): string {
  if (b.side === null || b.yard === 50) return '50'
  return `${teams[b.side].abbr} ${b.yard}`
}

const BREAKS = ['END 1ST', 'HALFTIME', 'END 3RD']

export function onAir(state: GameState | null): state is GameState {
  return state !== null && (state.inGame || state.inBreak)
}

export function formatSituation(s: Pick<GameState, 'inBreak' | 'quarter' | 'teams' | 'playKind' | 'isTry' | 'down' | 'yardsToGo'>): string {
  if (s.inBreak) {
    if (s.quarter < BREAKS.length) return BREAKS[s.quarter]
    return s.quarter === 3 && s.teams[0].score === s.teams[1].score ? 'END 4TH' : 'FINAL'
  }
  if (s.playKind === 'kickoff') return 'KICKOFF'
  if (s.isTry) return 'PAT'
  return formatDownDistance(s.down, s.yardsToGo)
}
