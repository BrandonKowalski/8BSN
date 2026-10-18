import type { PlayerLookup } from '../../../game/useGame'
import FootageLook from './FootageLook'
import ReplayLeadIn from './ReplayLeadIn'
import type { ReplayView } from './useReplay'

type Props = { view: ReplayView; abbrs: [string, string]; player: PlayerLookup }

export default function ReplayStage({ view, abbrs, player }: Props) {
  const { play, label } = view
  if (view.leadIn) {
    return (
      <section className="replay replay-lead-in" data-testid="replay-stage">
        <ReplayLeadIn label={label} abbr={abbrs[play.offense]} />
      </section>
    )
  }
  return (
    <section className="replay" data-testid="replay-stage">
      <div className="replay-head">
        <span className="replay-title">{label}</span>
      </div>
      <FootageLook view={view} abbrs={abbrs} player={player} />
    </section>
  )
}
