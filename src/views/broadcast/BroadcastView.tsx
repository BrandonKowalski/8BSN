import { onAir } from '../../game/format'
import { LIVE_DETECTION } from '../../game/maps/tsb2026'
import type { PlayTracker } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { LeagueGame } from '../../league/espn'
import type { NameLookup as Names } from '../../game/useGame'
import AroundTheLeague from './AroundTheLeague'
import Scorebug from './Scorebug'
import StatsPackage from './StatsPackage'
import './broadcast.css'

export function packageVisible(state: GameState | null, forcePackage: boolean, liveDetection: boolean): boolean {
  if (!onAir(state)) return false
  return liveDetection ? !state.live : forcePackage
}

export type SlotRef = (node: HTMLDivElement | null) => void

type Props = {
  state: GameState | null
  tracker: PlayTracker
  names: Names
  forcePackage: boolean
  canvasSlot: SlotRef
  games: LeagueGame[] | null
}

export default function BroadcastView({ state, tracker, names, forcePackage, canvasSlot, games }: Props) {
  const boxed = packageVisible(state, forcePackage, LIVE_DETECTION)
  return (
    <div className={boxed ? 'view view-broadcast boxed' : 'view view-broadcast'} data-testid="broadcast-view">
      <div className="bc-stage">
        <div className="bc-game">
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <div className="bc-package" data-testid="stats-package" hidden={!boxed}>
          {boxed && state && <StatsPackage state={state} tracker={tracker} names={names} />}
          <AroundTheLeague games={games} />
        </div>
        <Scorebug state={state} />
      </div>
    </div>
  )
}
