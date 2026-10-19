import { useRef } from 'react'
import { formatSituation, redZone, returnWord, scoreWord } from '../../game/format'
import type { PlayResult, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'

type Phase = { kind: 'down' } | { kind: 'scored'; word: string; team: 0 | 1 } | { kind: 'try'; snapped: boolean } | { kind: 'kickoff' } | { kind: 'held'; word: string }

export type DownBox = { text: string; scorer: 0 | 1 | null; redZone: boolean; down: boolean }

type Box = { phase: Phase; scores: [number, number] | null; kicking: boolean }

const DOWN: Phase = { kind: 'down' }

function scoredBy(before: readonly [number, number], after: readonly [number, number]): { team: 0 | 1; points: number } | null {
  const gains = [after[0] - before[0], after[1] - before[1]]
  if (gains[0] > 0 && gains[1] === 0) return { team: 0, points: gains[0] }
  if (gains[1] > 0 && gains[0] === 0) return { team: 1, points: gains[1] }
  return null
}

function score(phase: Phase, team: 0 | 1, points: number, isTry: boolean): Phase {
  if (isTry || phase.kind === 'try') return { kind: 'kickoff' }
  if (phase.kind === 'scored') return phase
  const word = scoreWord(points, false)
  return word ? { kind: 'scored', word, team } : phase
}

function onPlayEnd(phase: Phase, play: PlayResult): Phase {
  const scored = scoredBy(play.scoreBefore, play.scoreAfter)
  if (scored) return score(phase, scored.team, scored.points, play.isTry)
  if (play.isTry && phase.kind === 'try') return { kind: 'kickoff' }
  return phase
}

function onEvent(phase: Phase, event: TrackerEvent, state: GameState): Phase {
  if (event.type === 'playEnd') return onPlayEnd(phase, event.play)
  if (event.type === 'snap') {
    if (phase.kind === 'down') return phase
    if (phase.kind !== 'kickoff' && state.isTry) return { kind: 'try', snapped: true }
    return DOWN
  }
  if (event.type === 'playOver' && phase.kind === 'try' && phase.snapped) return { kind: 'kickoff' }
  return phase
}

const KICK_WORDS: Partial<Record<GameState['playKind'], string>> = { fieldGoal: 'FIELD GOAL', extraPoint: 'PAT' }

export const kickScoring = (state: GameState, kicking: boolean) =>
  (state.live || state.playOver) && !state.touchdown && (kicking || state.playKind === 'fieldGoal' || state.playKind === 'extraPoint')

function heldWord(state: GameState): string | null {
  if (!state.live && !state.playOver) return null
  if ((state.playKind === 'punt' || state.playKind === 'kickoff') && state.caught) return returnWord(state.playKind)
  return state.live ? (KICK_WORDS[state.playKind] ?? null) : null
}

export function stepDownBox(box: Box, state: GameState, events: readonly TrackerEvent[]): Box {
  const scores: [number, number] = [state.teams[0].score, state.teams[1].score]
  const kicking = state.inGame && kickScoring(state, box.kicking)
  let phase = box.phase
  for (const event of events) phase = onEvent(phase, event, state)
  const rise = box.scores && state.inGame && !kicking ? scoredBy(box.scores, scores) : null
  if (rise) phase = score(phase, rise.team, rise.points, state.isTry)
  const held = heldWord(state)
  if (state.inBreak) phase = DOWN
  else if (held && (phase.kind === 'down' || phase.kind === 'held')) phase = { kind: 'held', word: held }
  else if (phase.kind === 'held') phase = state.live || state.playOver ? phase : DOWN
  else if (state.playKind === 'kickoff' && (state.live || phase.kind !== 'scored')) phase = DOWN
  else if (phase.kind === 'scored' && state.isTry) phase = { kind: 'try', snapped: state.live }
  return { phase, scores: kicking ? box.scores : scores, kicking }
}

export function downBoxOf(phase: Phase, state: GameState, ended: number | null = null): DownBox {
  if (phase.kind === 'scored') return { text: phase.word, scorer: phase.team, redZone: false, down: false }
  if (phase.kind === 'try') return { text: 'PAT', scorer: null, redZone: false, down: false }
  if (phase.kind === 'kickoff') return { text: 'KICKOFF', scorer: null, redZone: false, down: false }
  if (phase.kind === 'held') return { text: phase.word, scorer: null, redZone: false, down: false }
  const down = !state.inBreak && !state.isTry && state.playKind === 'scrimmage'
  return { text: formatSituation(state, ended), scorer: null, redZone: down && redZone(state), down }
}

export function useDownBox(state: GameState | null, events: readonly TrackerEvent[], ended: number | null = null): DownBox | null {
  const box = useRef<Box>({ phase: DOWN, scores: null, kicking: false })
  const seen = useRef<{ state: GameState | null; events: WeakSet<TrackerEvent> }>({ state: null, events: new WeakSet() })
  if (state && seen.current.state !== state) {
    const fresh = events.filter((event) => !seen.current.events.has(event))
    for (const event of fresh) seen.current.events.add(event)
    box.current = stepDownBox(box.current, state, fresh)
    seen.current.state = state
  }
  return state ? downBoxOf(box.current.phase, state, ended) : null
}
