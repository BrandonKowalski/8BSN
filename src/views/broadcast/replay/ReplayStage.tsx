import { featuredTeam } from '../../../game/format'
import type { PlayerLookup } from '../../../game/useGame'
import FootageLook, { replayStats, Strip } from './FootageLook'
import ReplayLeadIn from './ReplayLeadIn'
import { INSTANT_REPLAY, type ReplayView } from './useReplay'

type Props = { view: ReplayView; abbrs: [string, string]; player: PlayerLookup }

export default function ReplayStage({ view, abbrs, player }: Props) {
  const { play } = view
  const label = view.label === INSTANT_REPLAY ? null : view.label
  if (view.leadIn) {
    return (
      <section className="replay replay-lead-in" data-testid="replay-stage">
        {label && (
          <div className="replay-head">
            <span className="replay-title">{label}</span>
          </div>
        )}
        <Strip stats={replayStats(play)} />
        <ReplayLeadIn label={label} abbr={abbrs[featuredTeam(play)]} />
      </section>
    )
  }
  return (
    <section className="replay" data-testid="replay-stage">
      {label && (
        <div className="replay-head">
          <span className="replay-title">{label}</span>
        </div>
      )}
      <FootageLook view={view} abbrs={abbrs} player={player} />
      <ReplayLeadIn label={label} abbr={abbrs[featuredTeam(play)]} leaving />
    </section>
  )
}
