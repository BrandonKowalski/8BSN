import { formatClock, formatQuarter, formatSituation, onAir } from '../../game/format'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { teamColor } from './teamColors'

export default function Scorebug({ state, helmets }: { state: GameState | null; helmets: Helmets }) {
  if (!onAir(state)) return null
  return (
    <div className="scorebug" data-testid="scorebug">
      {state.teams.map((team, side) => {
        const colors = teamColor(team.abbr)
        const helmet = helmets.get(team.id)
        return (
          <div className="bug-team" key={side} style={{ background: colors.primary, borderColor: colors.secondary }}>
            <span className="bug-abbr">
              <span className="bug-ball-slot">{state.possession === side && <span className="bug-ball" data-testid="bug-ball" />}</span>
              {helmet && <img className="bug-helmet" data-testid="bug-helmet" src={helmet} alt="" />}
              {team.abbr}
            </span>
            <span className="bug-score">{team.score}</span>
          </div>
        )
      })}
      <div className="bug-clock">
        {formatQuarter(state.quarter)} {formatClock(state.clock)}
      </div>
      <div className="bug-down">{formatSituation(state)}</div>
    </div>
  )
}
