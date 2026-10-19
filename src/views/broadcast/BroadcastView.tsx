import { useRef, useState } from 'react'
import type { Emulator } from '../../emu/Emulator'
import { LIVE_DETECTION } from '../../game/maps/tsb2026'
import type { PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import type { LeagueGame } from '../../league/espn'
import type { NameLookup as Names, PlayerLookup } from '../../game/useGame'
import Wordmark from '../../brand/Wordmark'
import { useBroadcastButtons } from '../../input/broadcastButtons'
import AroundTheLeague from './AroundTheLeague'
import BreakScreen, { useBreakTitle } from './BreakScreen'
import LowerTicker, { useLowerTicker } from './LowerTicker'
import ReplayStage from './replay/ReplayStage'
import { useReplayState } from './replay/useReplay'
import Scorebug from './Scorebug'
import ScoringWipe, { useScoringWipe } from './ScoringWipe'
import StatsPackage, { type Paging } from './StatsPackage'
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
  generation?: number
}

export default function BroadcastView({ state, tracker, names, player, forcePackage, canvasSlot, games, helmets = new Map(), emulator = null, rom = null, events = NO_EVENTS, generation = 0 }: Props) {
  const boxed = useBoxed(state, forcePackage)
  const { wipe, held, celebrating } = useScoringWipe(state, !boxed, generation)
  const screened = useBreakTitle(state, tracker) !== null
  const { view: replay, waiting, call } = useReplayState({ emulator, rom, tracker, events, boxed, celebrating, screened, generation })
  const [paging, setPaging] = useState<Paging>({ by: 1, n: 0 })
  const [restart, setRestart] = useState(0)
  const covered = replay !== null || waiting
  const band = useLowerTicker(events, tracker, boxed, generation)
  const abbrs: [string, string] = state ? [state.teams[0].abbr, state.teams[1].abbr] : NO_ABBRS
  useBroadcastButtons((button) => {
    if (button === 'replay') call()
    else if (covered) return
    else if (button === 'restartLastPlay') setRestart((n) => n + 1)
    else setPaging((p) => ({ by: button === 'prevPage' ? -1 : 1, n: p.n + 1 }))
  }, boxed)
  return (
    <div className={boxed ? 'view view-broadcast boxed' : 'view view-broadcast'} data-testid="broadcast-view">
      <div className="bc-stage">
        <div className="bc-game">
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <div className={replay || waiting ? 'bc-package replaying' : 'bc-package'} data-testid="stats-package" hidden={!boxed}>
          {replay && <ReplayStage view={replay} abbrs={abbrs} player={player} />}
          {boxed && state && <StatsPackage state={state} tracker={tracker} names={names} player={player} paging={paging} restart={restart} />}
          {band.ticker ? <LowerTicker band={band} abbrs={abbrs} player={player} /> : <AroundTheLeague games={games} entering={band.entering} />}
        </div>
        <ScoringWipe wipe={wipe} state={state} helmets={helmets} />
        <Scorebug state={state} helmets={helmets} events={events} held={held} generation={generation} />
        {!boxed && (
          <div className="bc-watermark" data-testid="watermark">
            <Wordmark variant="c3" />
          </div>
        )}
        <BreakScreen state={state} tracker={tracker} player={player} helmets={helmets} emulator={emulator} rom={rom} />
      </div>
    </div>
  )
}
