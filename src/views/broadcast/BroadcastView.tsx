import { useRef } from 'react'
import type { Emulator } from '../../emu/Emulator'
import { LIVE_DETECTION } from '../../game/maps/tsb2026'
import type { PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import type { LeagueGame } from '../../league/espn'
import type { NameLookup as Names, PlayerLookup } from '../../game/useGame'
import Wordmark from '../../brand/Wordmark'
import AroundTheLeague from './AroundTheLeague'
import ReplayStage from './replay/ReplayStage'
import { useReplay } from './replay/useReplay'
import Scorebug from './Scorebug'
import StatsPackage from './StatsPackage'
import './broadcast.css'

const NO_EVENTS: TrackerEvent[] = []
const NO_ABBRS: [string, string] = ['', '']

export function packageVisible(state: GameState | null, forcePackage: boolean, liveDetection: boolean, selectShown = false): boolean {
  if (!state?.inGame) return false
  if (!liveDetection) return forcePackage
  return state.playSelect || (state.betweenPlays && !selectShown)
}

function useBoxed(state: GameState | null, forcePackage: boolean): boolean {
  const selectShown = useRef(false)
  if (!state?.betweenPlays && !state?.playSelect) selectShown.current = false
  const boxed = packageVisible(state, forcePackage, LIVE_DETECTION, selectShown.current)
  if (state?.playSelect) selectShown.current = true
  return boxed
}

export type SlotRef = (node: HTMLDivElement | null) => void

type Props = {
  state: GameState | null
  tracker: PlayTracker
  names: Names
  player: PlayerLookup
  forcePackage: boolean
  canvasSlot: SlotRef
  games: LeagueGame[] | null
  helmets?: Helmets
  emulator?: Emulator | null
  rom?: Uint8Array | null
  events?: TrackerEvent[]
}

export default function BroadcastView({ state, tracker, names, player, forcePackage, canvasSlot, games, helmets = new Map(), emulator = null, rom = null, events = NO_EVENTS }: Props) {
  const boxed = useBoxed(state, forcePackage)
  const replay = useReplay({ emulator, rom, tracker, events, boxed })
  return (
    <div className={boxed ? 'view view-broadcast boxed' : 'view view-broadcast'} data-testid="broadcast-view">
      <div className="bc-stage">
        <div className="bc-game">
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <div className={replay ? 'bc-package replaying' : 'bc-package'} data-testid="stats-package" hidden={!boxed}>
          {replay && <ReplayStage view={replay} abbrs={state ? [state.teams[0].abbr, state.teams[1].abbr] : NO_ABBRS} player={player} />}
          {boxed && state && <StatsPackage state={state} tracker={tracker} names={names} player={player} />}
          <AroundTheLeague games={games} />
        </div>
        <Scorebug state={state} helmets={helmets} />
        {!boxed && (
          <div className="bc-watermark" data-testid="watermark">
            <Wordmark variant="c2" />
          </div>
        )}
      </div>
    </div>
  )
}
