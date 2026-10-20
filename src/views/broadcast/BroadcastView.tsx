import { useEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../emu/Emulator'
import LeagueTicker from '../../broadcast/LeagueTicker'
import { onAir } from '../../game/format'
import { TSB_LEAGUE } from '../../game/league'
import { LIVE_DETECTION } from '../../game/maps/tsb2026'
import type { PlayTracker, TrackerEvent } from '../../game/playTracker'
import type { GameState } from '../../game/types'
import type { Helmets } from '../../helmets/useHelmets'
import { leagueData } from '../../league/leagueData'
import type { LeagueGame, Records } from '../../sdk/types'
import type { PlayerLookup } from '../../game/useGame'
import Wordmark from '../../brand/Wordmark'
import { resolveBindings, useActions } from '../../input/actions'
import BreakScreen, { useBreakTitle } from './BreakScreen'
import HelmetClash from './HelmetClash'
import LowerTicker, { useLowerTicker } from './LowerTicker'
import ReplayStage from './replay/ReplayStage'
import { useReplayState } from './replay/useReplay'
import Scorebug from './Scorebug'
import ScoringWipe, { useScoringWipe } from './ScoringWipe'
import StatsPackage, { lastPlayMs, type Paging } from './StatsPackage'
import './broadcast.css'

const NO_EVENTS: TrackerEvent[] = []
const NO_ABBRS: [string, string] = ['', '']
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

export const ATTRACT_TAIL_MS = 1000
export const ATTRACT_CAP_MS = 30000

export function useAttractHold(emulator: Emulator | null, holding: boolean, replaying: boolean, graphicMs: number) {
  const releaseRef = useRef<(() => void) | null>(null)
  const replayedRef = useRef(false)
  const replayingRef = useRef(replaying)
  replayingRef.current = replaying
  if (holding && replaying) replayedRef.current = true
  useEffect(() => {
    if (!holding || !emulator) return
    emulator.pause()
    replayedRef.current = replayingRef.current
    let held = true
    const release = () => {
      if (!held) return
      held = false
      clearTimeout(cap)
      releaseRef.current = null
      emulator.resume()
    }
    const cap = setTimeout(release, ATTRACT_CAP_MS)
    releaseRef.current = release
    return release
  }, [holding, emulator])
  useEffect(() => {
    if (!holding || replaying) return
    const wait = (replayedRef.current ? 0 : graphicMs) + ATTRACT_TAIL_MS
    const timer = setTimeout(() => releaseRef.current?.(), wait)
    return () => clearTimeout(timer)
  }, [holding, replaying, graphicMs])
}

export function usePregame(state: GameState | null, generation: number): boolean {
  const seen = useRef({ pregame: false, generation })
  if (seen.current.generation !== generation) seen.current = { pregame: false, generation }
  if (state?.intro === 'card') seen.current.pregame = true
  else if (!state || state.inGame) seen.current.pregame = false
  return seen.current.pregame
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
  attract?: boolean
  records?: Records | null
  aftershow?: GameState | null
  onAftershowDone?: () => void
}

export default function BroadcastView({ state, tracker, player, forcePackage, onForceWindow, canvasSlot, games, helmets = new Map(), emulator = null, rom = null, events = NO_EVENTS, generation = 0, attract = false, records = null, aftershow = null, onAftershowDone }: Props) {
  const boxed = useBoxed(state, forcePackage)
  const { wipe, held, celebrating } = useScoringWipe(state, !boxed, generation)
  const screened = useBreakTitle(state, tracker) !== null
  const { view: replay, waiting, call, skip } = useReplayState({ emulator, rom, tracker, events, boxed, celebrating, screened, generation })
  const [paging, setPaging] = useState<Paging>({ by: 1, n: 0 })
  const [restart, setRestart] = useState(0)
  const covered = replay !== null || waiting
  useAttractHold(emulator, attract && boxed && state?.playSelect === true, covered, lastPlayMs(tracker.latestPlay()))
  const band = useLowerTicker(events, tracker, boxed, generation)
  const pregame = usePregame(state, generation)
  const menus = !onAir(state) && !pregame
  const abbrs: [string, string] = state ? [state.teams[0].abbr, state.teams[1].abbr] : NO_ABBRS
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
    <div className={`view view-broadcast${boxed ? ' boxed' : ''}${menus ? ' menus' : ''}`} data-testid="broadcast-view">
      <div className="bc-stage">
        <div className="bc-game">
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <div className={replay || waiting ? 'bc-package replaying' : 'bc-package'} data-testid="stats-package" hidden={!boxed && !menus}>
          {replay && <ReplayStage view={replay} abbrs={abbrs} player={player} />}
          {boxed && state && <StatsPackage state={state} tracker={tracker} player={player} paging={paging} restart={restart} covered={covered} />}
          {band.ticker ? <LowerTicker band={band} abbrs={abbrs} player={player} /> : <LeagueTicker games={games} entering={band.entering} color={(a) => TSB_LEAGUE.colors?.[a] ?? NEUTRAL} detail={TSB_LEAGUE.detail} />}
        </div>
        <ScoringWipe wipe={wipe} state={state} helmets={helmets} />
        <Scorebug state={state} helmets={helmets} events={events} held={held} generation={generation} />
        {!boxed && (
          <div className="bc-watermark" data-testid="watermark">
            <Wordmark variant="c3" />
          </div>
        )}
        <HelmetClash state={state} helmets={helmets} generation={generation} league={leagueData(TSB_LEAGUE, games, records)} />
        <BreakScreen state={state} tracker={tracker} player={player} helmets={helmets} emulator={emulator} rom={rom} aftershow={aftershow} onClose={aftershow ? onAftershowDone : undefined} />
      </div>
    </div>
  )
}
