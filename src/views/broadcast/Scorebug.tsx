import { formatClock, formatQuarter, formatSituation, onAir } from '../../game/format'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import PixelFootball from './PixelFootball'
import { teamColor } from './teamColors'
import { useSettledPossession } from './useSettledPossession'

export default function Scorebug({ state, helmets }: { state: GameState | null; helmets: Helmets }) {
  const possession = useSettledPossession(state)
  if (!onAir(state)) return null
  return (
    <div className="scorebug" data-testid="scorebug">
      {state.teams.map((team, side) => {
        const colors = teamColor(team.abbr)
        const helmet = helmets.get(team.id)
        return (
          <div className="bug-team" key={side} style={{ background: colors.primary, borderColor: colors.secondary }}>
            <span className="bug-abbr">
              {helmet && <img className="bug-helmet" data-testid="bug-helmet" src={helmet} alt="" />}
              {team.abbr}
              <span className="bug-ball-slot">{possession === side && <PixelFootball className="bug-ball" testId="bug-ball" />}</span>
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
