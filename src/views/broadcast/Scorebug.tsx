import { useEffect, useState } from 'react'
import { formatClock, formatQuarter, keyDown, onAir } from '../../game/format'
import type { TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import PixelFootball from './PixelFootball'
import { teamColor } from './teamColors'
import { useDownBox } from './useDownBox'
import { useSettledPossession } from './useSettledPossession'

const CHIP_MS = 4000
const IDLE_ROW = '#2b2f36'
const IDLE_EDGE = '#555'
const TIMEOUTS = 3
const NO_EVENTS: TrackerEvent[] = []

const downKey = (state: GameState) => `${state.quarter}:${state.offense}:${state.down}:${state.yardsToGo}:${state.ballOn.side}:${state.ballOn.yard}`

function useChip(state: GameState | null, allowed: boolean): string | null {
  const text = state && allowed ? keyDown(state) : null
  const key = state && text ? `${downKey(state)}:${text}` : null
  const [shown, setShown] = useState<{ key: string; done: boolean } | null>(null)
  useEffect(() => {
    if (!key || shown?.key === key) return
    setShown({ key, done: false })
  }, [key, shown])
  useEffect(() => {
    if (!shown || shown.done) return
    const timer = setTimeout(() => setShown((s) => s && { ...s, done: true }), CHIP_MS)
    return () => clearTimeout(timer)
  }, [shown])
  return key && shown?.key === key && !shown.done ? text : null
}

type Props = { state: GameState | null; helmets: Helmets; events?: readonly TrackerEvent[] }

export default function Scorebug({ state, helmets, events = NO_EVENTS }: Props) {
  const possession = useSettledPossession(state)
  const box = useDownBox(state, events)
  const chip = useChip(state, box?.down ?? false)
  if (!onAir(state) || !box) return null
  const scorer = box.scorer === null ? null : teamColor(state.teams[box.scorer].abbr)
  return (
    <div className="scorebug" data-testid="scorebug">
      {chip && (
        <div className={state.down === 4 ? 'bug-chip bug-chip-hot' : 'bug-chip'} data-testid="bug-chip">
          {chip}
        </div>
      )}
      {state.teams.map((team, side) => {
        const colors = teamColor(team.abbr)
        const lit = possession === side
        const helmet = helmets.get(team.id)
        return (
          <div className="bug-team" key={side} style={{ backgroundColor: lit ? colors.primary : IDLE_ROW, borderColor: lit ? colors.secondary : IDLE_EDGE }}>
            <span className="bug-abbr">
              {helmet && <img className="bug-helmet" data-testid="bug-helmet" src={helmet} alt="" />}
              <span className="bug-name">
                {team.abbr}
                <span className="bug-timeouts">
                  {Array.from({ length: TIMEOUTS }, (_, i) => (
                    <span className={i < team.timeouts ? 'bug-timeout' : 'bug-timeout used'} key={i} />
                  ))}
                </span>
              </span>
              <span className="bug-ball-slot">{lit && <PixelFootball className="bug-ball" testId="bug-ball" />}</span>
            </span>
            <span className="bug-score" data-testid={`bug-score-${side}`}>
              {team.score}
            </span>
          </div>
        )
      })}
      <div className="bug-clock">
        {formatQuarter(state.quarter)} {formatClock(state.clock)}
      </div>
      <div className={box.redZone ? 'bug-down bug-red-zone' : 'bug-down'} style={scorer ? { backgroundColor: scorer.primary, color: '#fff' } : undefined}>
        {box.text}
      </div>
    </div>
  )
}
