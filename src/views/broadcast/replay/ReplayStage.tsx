import type { Look } from '../../../game/analysis'
import type { PlayerLookup } from '../../../game/useGame'
import RouteReplay from '../RouteReplay'
import FootageLook, { Caption } from './FootageLook'
import TopDownLook from './TopDownLook'
import type { ReplayView } from './useReplay'

const LOOK_LABEL: Record<Look, string> = {
  footage: 'GAME FOOTAGE',
  topdown: 'TOP DOWN',
  telestrator: 'TELESTRATOR',
}

type Props = { view: ReplayView; abbrs: [string, string]; player: PlayerLookup }

export default function ReplayStage({ view, abbrs, player }: Props) {
  const { look, play, label } = view
  return (
    <section className={`replay replay-${look}`} data-testid="replay-stage">
      <div className="replay-head">
        <span className="replay-title">{label}</span>
        <span className="replay-look">{LOOK_LABEL[look]}</span>
      </div>
      {look === 'footage' ? (
        <FootageLook key="footage" view={view} player={player} />
      ) : (
        <>
          <div key={look} className="replay-picture">
            {look === 'topdown' ? <TopDownLook play={play} abbrs={abbrs} player={player} /> : <RouteReplay play={play} abbrs={abbrs} size="replay" player={player} />}
          </div>
          <Caption play={play} player={player} />
        </>
      )}
    </section>
  )
}
