import { formatClock, formatQuarter, formatSituation, onAir } from '../../game/format'
import type { GameState } from '../../game/types'
import { teamColor } from './teamColors'

export default function Scorebug({ state }: { state: GameState | null }) {
  if (!onAir(state)) return null
  return (
    <div className="scorebug" data-testid="scorebug">
      {state.teams.map((team, side) => {
        const colors = teamColor(team.abbr)
        return (
          <div className="bug-team" key={side} style={{ background: colors.primary, borderColor: colors.secondary }}>
            <span className="bug-abbr">
              {state.possession === side && <span className="bug-ball" />}
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
