import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Wordmark from '../../brand/Wordmark'
import { scoreWord } from '../../game/format'
import type { PlayResult, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { SCORING_WIPE_MS } from './replay/useReplay'
import { teamColor } from './teamColors'

const TICK_MS = 50
const COUNT_FROM_MS = 500
const COUNT_SPAN_MS = 700

type Score = { play: PlayResult; team: 0 | 1; word: string }
export type Wipe = Score & { elapsed: number }

function scoreOf(play: PlayResult): Score | null {
  const gains = [play.scoreAfter[0] - play.scoreBefore[0], play.scoreAfter[1] - play.scoreBefore[1]]
  const team: 0 | 1 | null = gains[0] > 0 ? 0 : gains[1] > 0 ? 1 : null
  if (team === null) return null
  const word = scoreWord(gains[team], play.isTry) ?? (play.isTry ? 'PAT' : play.touchdown ? 'TOUCHDOWN' : play.kind === 'fieldGoal' ? 'FIELD GOAL' : 'SCORE')
  return { play, team, word }
}

function wipeScore(wipe: Wipe): number {
  const side = wipe.team
  const { scoreBefore, scoreAfter } = wipe.play
  const share = Math.min(1, Math.max(0, (wipe.elapsed - COUNT_FROM_MS) / COUNT_SPAN_MS))
  return scoreBefore[side] + Math.round((scoreAfter[side] - scoreBefore[side]) * share)
}

export function useScoringWipe(events: readonly TrackerEvent[], state: GameState | null, allowed = true): Wipe | null {
  const [score, setScore] = useState<Score | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const seen = useRef(new WeakSet<TrackerEvent>())
  const blocked = !state || state.live || state.playSelect || !allowed

  useEffect(() => {
    let next: Score | null = null
    for (const event of events) {
      if (seen.current.has(event)) continue
      seen.current.add(event)
      if (event.type === 'playEnd') next = scoreOf(event.play) ?? next
      if (event.type === 'snap') next = null
    }
    if (blocked) setScore(null)
    else if (next) {
      setScore(next)
      setElapsed(0)
    }
  }, [events, blocked])

  useEffect(() => {
    if (!score) return
    const started = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - started), TICK_MS)
    const done = setTimeout(() => setScore(null), SCORING_WIPE_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(done)
    }
  }, [score])

  return score && !blocked ? { ...score, elapsed } : null
}

type Props = { wipe: Wipe | null; state: GameState | null; helmets: Helmets }

export default function ScoringWipe({ wipe, state, helmets }: Props) {
  if (!wipe || !state) return null
  const scorer = state.teams[wipe.team]
  const colors = teamColor(scorer.abbr)
  const helmet = helmets.get(scorer.id)
  const style = { '--wipe-primary': colors.primary, '--wipe-secondary': colors.secondary, '--wipe-ms': `${SCORING_WIPE_MS}ms` } as CSSProperties
  return (
    <div className="scoring-wipe" data-testid="scoring-wipe" style={style}>
      {(['left', 'right'] as const).map((side) => (
        <div className={`wipe-panel wipe-${side}`} key={side} data-testid={`wipe-${side}`}>
          {helmet && <img className="wipe-helmet" src={helmet} alt="" />}
          <div className="wipe-word">{wipe.word}</div>
          <div className="wipe-score" data-testid={`wipe-score-${side}`}>
            {scorer.abbr} <span className="wipe-points">{wipeScore(wipe)}</span>
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
