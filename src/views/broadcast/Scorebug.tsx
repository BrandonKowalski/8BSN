import { formatClock, formatQuarter, formatSituation, onAir } from '../../game/format'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { teamColor } from './teamColors'
import { useSettledPossession } from './useSettledPossession'

const FOOTBALL = ['..#######..', '.##w#w#w##.', '###wwwww###', '.##w#w#w##.', '..#######..']

function Football() {
  return (
    <svg className="bug-ball" data-testid="bug-ball" viewBox={`0 0 ${FOOTBALL[0].length} ${FOOTBALL.length}`} shapeRendering="crispEdges">
      {FOOTBALL.flatMap((row, y) =>
        [...row].map((px, x) => (px === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={px === 'w' ? '#fff' : '#8b4a1c'} />)),
      )}
    </svg>
  )
}

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
              <span className="bug-ball-slot">{possession === side && <Football />}</span>
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
