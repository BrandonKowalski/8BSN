import type { PlayerLookup } from '../../../game/useGame'
import RouteReplay from '../RouteReplay'
import FootageLook, { Caption } from './FootageLook'
import ReplayLeadIn from './ReplayLeadIn'
import TopDownLook from './TopDownLook'
import { REPLAY_SPEED, type ReplayView } from './useReplay'

type Props = { view: ReplayView; abbrs: [string, string]; player: PlayerLookup }

export default function ReplayStage({ view, abbrs, player }: Props) {
  const { look, play, label } = view
  if (view.leadIn) {
    return (
      <section className="replay replay-lead-in" data-testid="replay-stage">
        <ReplayLeadIn label={label} abbr={abbrs[play.offense]} />
      </section>
    )
  }
  return (
    <section className={`replay replay-${look}`} data-testid="replay-stage">
      <div className="replay-head">
        <span className="replay-title">{label}</span>
      </div>
      {look === 'footage' ? (
        <FootageLook key="footage" view={view} abbrs={abbrs} player={player} />
      ) : (
        <>
          <div key={look} className="replay-picture">
            {look === 'topdown' ? (
              <TopDownLook play={play} abbrs={abbrs} player={player} rate={REPLAY_SPEED} />
            ) : (
              <RouteReplay play={play} abbrs={abbrs} size="replay" player={player} rate={REPLAY_SPEED} />
            )}
          </div>
          <Caption play={play} player={player} />
        </>
      )}
    </section>
  )
}
