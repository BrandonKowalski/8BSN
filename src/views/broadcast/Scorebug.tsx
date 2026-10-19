import { formatClock, formatQuarter, onAir } from '../../game/format'
import type { TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import PixelFootball from './PixelFootball'
import type { Held } from './ScoringWipe'
import { teamColor } from './teamColors'
import { useDownBox } from './useDownBox'
import { useEndedQuarter } from './useEndedQuarter'
import { useSettledPossession } from './useSettledPossession'

const IDLE_ROW = '#2b2f36'
const IDLE_EDGE = '#555'
const TIMEOUTS = 3
const NO_EVENTS: TrackerEvent[] = []

type Props = { state: GameState | null; helmets: Helmets; events?: readonly TrackerEvent[]; held?: Held | null }

export default function Scorebug({ state, helmets, events = NO_EVENTS, held = null }: Props) {
  const possession = useSettledPossession(state)
  const ended = useEndedQuarter(state)
  const box = useDownBox(state, events, ended)
  if (!onAir(state) || !box) return null
  const scorer = box.scorer === null ? null : teamColor(state.teams[box.scorer].abbr)
  return (
    <div className="scorebug" data-testid="scorebug">
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
              {held?.team === side ? held.score : team.score}
            </span>
          </div>
        )
      })}
      <div className="bug-clock">
        {formatQuarter(state.inBreak ? (ended ?? state.quarter - 1) : state.quarter)} {formatClock(state.clock)}
      </div>
      <div className={box.redZone ? 'bug-down bug-red-zone' : 'bug-down'} style={scorer ? { backgroundColor: scorer.primary, color: '#fff' } : undefined}>
        {box.text}
      </div>
    </div>
  )
}
