import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Emulator } from '../../emu/Emulator'
import LeagueTicker from '../../broadcast/LeagueTicker'
import { DEFAULT_LAYOUT, gameStyle, regionStyle } from '../../broadcast/layout'
import MomentStage from '../../broadcast/moments/MomentStage'
import { useMoments } from '../../broadcast/moments/useMoments'
import { onAir } from '../../game/format'
import { tsbTailgate } from '../../game/tailgate'
import { TSB_LEAGUE } from '../../game/league'
import { LIVE_DETECTION } from '../../game/maps/tsb2026'
import type { PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { leagueData } from '../../league/leagueData'
import type { Layout, LeagueGame, Phase, Records, Region, ReplayView, TailgatePick } from '../../sdk/types'
import type { PlayerLookup } from '../../game/useGame'
import Wordmark from '../../brand/Wordmark'
import { resolveBindings, useActions } from '../../input/actions'
import { useTailgate, useTailgateHold, type TailgateInput } from '../../tailgate/useTailgate'
import BreakScreen, { useBreakTitle } from './BreakScreen'
import HelmetClash from './HelmetClash'
import LowerTicker, { useLowerTicker } from './LowerTicker'
import { TsbReplay, tsbMoments, type Replayed, type TsbView } from './replay/tsbMoments'
import Scorebug from './Scorebug'
import ScoringWipe, { useScoringWipe } from './ScoringWipe'
import { DriveSlot, LastPlay, Stats, type Paging } from './StatsPackage'
import '../../broadcast/station.css'
import './broadcast.css'

const NO_EVENTS: TrackerEvent[] = []
const noop = () => undefined
const NEUTRAL = { primary: '#333', secondary: '#999' }

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

function useStarted(state: GameState | null, emulator: Emulator | null, tailgate: boolean): boolean {
  const seen = useRef({ emulator, started: false })
  if (!tailgate || seen.current.emulator !== emulator) seen.current = { emulator, started: false }
  if (state?.inGame) seen.current.started = true
  return seen.current.started
}

export function usePregame(state: GameState | null, generation: number): boolean {
  const seen = useRef({ pregame: false, generation })
  if (seen.current.generation !== generation) seen.current = { pregame: false, generation }
  if (state?.intro === 'card') seen.current.pregame = true
  else if (!state || state.inGame) seen.current.pregame = false
  return seen.current.pregame
}

function RegionBox({ layout, name, phase, children }: { layout: Layout; name: Region; phase: Phase; children?: ReactNode }) {
  const style = regionStyle(layout, name, phase)
  return (
    <div className={`bc-region bc-region-${name}`} data-testid={`region-${name}`} style={style ?? undefined} hidden={style === null}>
      {children}
    </div>
  )
}

export type SlotRef = (node: HTMLDivElement | null) => void

type Props = {
  state: GameState | null
  tracker: PlayTracker
  player: PlayerLookup
  forcePackage: boolean
  onForceWindow?: () => void
  canvasSlot: SlotRef
  games: LeagueGame[] | null
  helmets?: Helmets
  emulator?: Emulator | null
  rom?: Uint8Array | null
  events?: TrackerEvent[]
  generation?: number
  tailgate?: boolean
  asking?: boolean
  pick?: TailgatePick | null
  onTailgateFinal?: () => void
  onTailgateInput?: (input: TailgateInput) => void
  records?: Records | null
  aftershow?: GameState | null
  onAftershowDone?: () => void
}

export default function BroadcastView({ state, tracker, player, forcePackage, onForceWindow, canvasSlot, games, helmets = new Map(), emulator = null, rom = null, events = NO_EVENTS, generation = 0, tailgate = false, asking = false, pick = null, onTailgateFinal = noop, onTailgateInput = noop, records = null, aftershow = null, onAftershowDone }: Props) {
  const boxed = useBoxed(state, forcePackage)
  const { wipe, held, celebrating } = useScoringWipe(state, !boxed, generation)
  const screened = useBreakTitle(state, tracker) !== null
  const away = state?.teams[0].abbr ?? ''
  const home = state?.teams[1].abbr ?? ''
  const abbrs = useMemo<[string, string]>(() => [away, home], [away, home])
  const started = useStarted(state, emulator, tailgate)
  const data = useMemo<TsbView>(
    () => ({ tracker, events, celebrating, screened, abbrs, player, state, final: aftershow, boxed, started }),
    [tracker, events, celebrating, screened, abbrs, player, state, aftershow, boxed, started],
  )
  const { view: replay, waiting, call, skip } = useMoments({ emulator, rom, moments: tsbMoments, data, open: boxed, generation })
  const [paging, setPaging] = useState<Paging>({ by: 1, n: 0 })
  const [restart, setRestart] = useState(0)
  const covered = replay !== null || waiting
  useTailgate({ emulator, spec: tsbTailgate, data, pick, active: tailgate, asking, onFinal: onTailgateFinal, onInput: onTailgateInput })
  useTailgateHold(emulator, tailgate && tsbTailgate.hold(data), covered, tsbTailgate.holdMs(data))
  const band = useLowerTicker(events, tracker, boxed, generation)
  const pregame = usePregame(state, generation)
  const menus = !onAir(state) && !pregame
  const phase: Phase = boxed ? 'window' : menus ? 'menus' : pregame ? 'pregame' : state?.inBreak ? 'break' : 'live'
  const layout = DEFAULT_LAYOUT
  const bindings = useMemo(() => resolveBindings(), [])
  useActions(
    bindings,
    (id) => {
      if (id === 'forceWindow') onForceWindow?.()
      else if (id === 'replay') call()
      else if (id === 'skip') skip()
      else if (covered) return
      else if (id === 'restart') setRestart((n) => n + 1)
      else setPaging((p) => ({ by: id === 'prevPage' ? -1 : 1, n: p.n + 1 }))
    },
    (id) => id === 'forceWindow' || (boxed && (id !== 'skip' || covered)),
    boxed,
  )
  return (
    <div className="view view-broadcast" data-testid="broadcast-view">
      <div className={covered ? 'bc-stage covered' : 'bc-stage'} data-phase={phase} data-testid="bc-stage">
        <div className="bc-game" style={gameStyle(layout, phase)}>
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <RegionBox layout={layout} name="replay" phase={phase}>
          {replay && (
            <MomentStage view={replay}>
              <TsbReplay data={data} view={replay as ReplayView<Replayed>} />
            </MomentStage>
          )}
        </RegionBox>
        <RegionBox layout={layout} name="top" phase={phase}>
          {boxed && state && <LastPlay state={state} tracker={tracker} player={player} restart={restart} covered={covered} />}
        </RegionBox>
        <RegionBox layout={layout} name="stats" phase={phase}>
          {boxed && state && <Stats state={state} tracker={tracker} player={player} paging={paging} />}
        </RegionBox>
        <RegionBox layout={layout} name="left" phase={phase}>
          {boxed && state && <DriveSlot state={state} tracker={tracker} player={player} />}
        </RegionBox>
        <RegionBox layout={layout} name="ticker" phase={phase}>
          {band.ticker ? <LowerTicker band={band} abbrs={abbrs} player={player} /> : <LeagueTicker games={games} entering={band.entering} color={(a) => TSB_LEAGUE.colors?.[a] ?? NEUTRAL} detail={TSB_LEAGUE.detail} />}
        </RegionBox>
        <RegionBox layout={layout} name="scorebug" phase={phase}>
          <ScoringWipe wipe={wipe} state={state} helmets={helmets} />
          <Scorebug state={state} helmets={helmets} events={events} held={held} generation={generation} />
        </RegionBox>
        <RegionBox layout={layout} name="watermark" phase={phase}>
          <div className="bc-watermark" data-testid="watermark">
            <Wordmark variant="c3" />
          </div>
        </RegionBox>
        <HelmetClash state={state} helmets={helmets} generation={generation} league={leagueData(TSB_LEAGUE, games, records)} />
        <BreakScreen state={state} tracker={tracker} player={player} helmets={helmets} emulator={emulator} rom={rom} aftershow={aftershow} onClose={aftershow ? onAftershowDone : undefined} />
      </div>
    </div>
  )
}
