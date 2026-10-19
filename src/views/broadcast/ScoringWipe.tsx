import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Wordmark from '../../brand/Wordmark'
import { scoreWord } from '../../game/format'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { teamColor } from './teamColors'

export const WIPE_MIN_MS = 1500
export const WIPE_CAP_MS = 12000
export const WIPE_EXIT_MS = 250
const TICK_MS = 50
const COUNT_FROM_MS = 500
const COUNT_SPAN_MS = 700
const WORD_SPAN_CQH = 34
const WORD_MAX_CQH = 11
const GLYPH_EM = 0.52

type Score = { team: 0 | 1; word: string; before: number; after: number }
export type Wipe = Score & { elapsed: number; leaving: boolean }
export type Held = { team: 0 | 1; score: number }
export type Celebration = { wipe: Wipe | null; held: Held | null; celebrating: boolean }

type Machine = { state: GameState | null; prev: [number, number] | null; score: Score | null; started: number | null; leaving: number | null }

function riseOf(before: [number, number], state: GameState): Score | null {
  const after: [number, number] = [state.teams[0].score, state.teams[1].score]
  const gains = [after[0] - before[0], after[1] - before[1]]
  const team: 0 | 1 | null = gains[0] > 0 && gains[1] === 0 ? 0 : gains[1] > 0 && gains[0] === 0 ? 1 : null
  if (team === null) return null
  const word = scoreWord(gains[team], state.isTry)
  return word ? { team, word, before: before[team], after: after[team] } : null
}

function step(m: Machine, state: GameState | null, allowed: boolean, now: number): void {
  if (state && state !== m.state) {
    const rise = m.prev && state.inGame ? riseOf(m.prev, state) : null
    if (rise) {
      m.score = rise
      m.started = null
      m.leaving = null
    }
    m.prev = [state.teams[0].score, state.teams[1].score]
    m.state = state
  }
  if (!m.score) return
  const stopped = !state || state.live || state.playSelect
  if (m.started === null) {
    if (stopped) m.score = null
    else if (allowed) m.started = now
    return
  }
  if (stopped) {
    m.score = null
    m.started = null
    m.leaving = null
    return
  }
  const shown = now - m.started
  if (m.leaving === null && ((!allowed && shown >= WIPE_MIN_MS) || shown >= WIPE_CAP_MS)) m.leaving = now
  if (m.leaving !== null && now - m.leaving >= WIPE_EXIT_MS) {
    m.score = null
    m.started = null
    m.leaving = null
  }
}

export function useScoringWipe(state: GameState | null, allowed = true): Celebration {
  const machine = useRef<Machine>({ state: null, prev: null, score: null, started: null, leaving: null })
  const [, redraw] = useState(0)
  const now = Date.now()
  step(machine.current, state, allowed, now)
  const { score, started, leaving } = machine.current
  const running = score !== null && started !== null
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => redraw((n) => n + 1), TICK_MS)
    return () => clearInterval(tick)
  }, [running])
  if (!score) return { wipe: null, held: null, celebrating: false }
  const held = { team: score.team, score: score.before }
  if (started === null) return { wipe: null, held, celebrating: false }
  return { wipe: { ...score, elapsed: now - started, leaving: leaving !== null }, held, celebrating: true }
}

function counted(wipe: Wipe): number {
  const share = Math.min(1, Math.max(0, (wipe.elapsed - COUNT_FROM_MS) / COUNT_SPAN_MS))
  return wipe.before + Math.round((wipe.after - wipe.before) * share)
}

const wordSize = (word: string) => `${Math.min(WORD_MAX_CQH, WORD_SPAN_CQH / (word.length * GLYPH_EM)).toFixed(2)}cqh`

type Props = { wipe: Wipe | null; state: GameState | null; helmets: Helmets }

export default function ScoringWipe({ wipe, state, helmets }: Props) {
  if (!wipe || !state) return null
  const scorer = state.teams[wipe.team]
  const colors = teamColor(scorer.abbr)
  const helmet = helmets.get(scorer.id)
  const style = { '--wipe-primary': colors.primary, '--wipe-secondary': colors.secondary } as CSSProperties
  return (
    <div className={wipe.leaving ? 'scoring-wipe wipe-leaving' : 'scoring-wipe'} data-testid="scoring-wipe" style={style}>
      {(['left', 'right'] as const).map((side) => (
        <div className={`wipe-panel wipe-${side}`} key={side} data-testid={`wipe-${side}`}>
          <div className="wipe-top">{helmet && <img className="wipe-helmet" src={helmet} alt="" />}</div>
          <div className="wipe-bar" data-testid={`wipe-score-${side}`}>
            {scorer.abbr} <span className="wipe-points">{counted(wipe)}</span>
          </div>
          <div className="wipe-bottom">
            <div className="wipe-word" style={{ fontSize: wordSize(wipe.word) }}>
              {wipe.word}
            </div>
          </div>
          {side === 'right' && (
            <div className="wipe-mark">
              <Wordmark variant="c3" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
