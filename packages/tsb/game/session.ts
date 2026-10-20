import { useMemo, useRef } from 'react'
import type { Emulator, Phase, Records, Session, SessionContext } from '@8bsn/sdk'
import type { Helmets } from '../helmets/useHelmets'
import { useHelmets } from '../helmets/useHelmets'
import { useBreakTitle } from '../broadcast/BreakScreen'
import { useLowerTicker, type Band } from '../broadcast/LowerTicker'
import { useScoringWipe, type Celebration } from '../broadcast/ScoringWipe'
import { setTeamEra } from '../broadcast/teamColors'
import { onAir } from './format'
import { LIVE_DETECTION } from './maps/tsb2026'
import type { PlayTracker, TrackerEvent } from './playTracker'
import { tsbRom } from './roms'
import type { GameState } from './types'
import { useGame, type GameSidecar, type PlayerLookup } from './useGame'

export type TsbView = {
  state: GameState | null
  final: GameState | null
  tracker: PlayTracker
  events: TrackerEvent[]
  player: PlayerLookup
  helmets: Helmets
  records: Records | null
  boxed: boolean
  pregame: boolean
  started: boolean
  wipe: Celebration
  band: Band
  screened: boolean
  romSha1: string
  abbrs: [string, string]
}

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

export function phaseOf(state: GameState | null, boxed: boolean, pregame: boolean): Phase {
  if (boxed) return 'window'
  if (!onAir(state) && !pregame) return 'menus'
  if (pregame) return 'pregame'
  return state?.inBreak ? 'break' : 'live'
}

export function useTsbSession(ctx: SessionContext): Session<TsbView, GameSidecar> {
  const image = useMemo(() => (ctx.rom ? { bytes: ctx.rom.bytes, rom: tsbRom(ctx.rom.sha1) } : null), [ctx.rom])
  if (image) setTeamEra(image.rom.colors)
  const game = useGame(ctx.emulator, image)
  const helmets = useHelmets(image)
  const { state, final, tracker, events, generation, player } = game
  const boxed = useBoxed(state, ctx.forceWindow)
  const wipe = useScoringWipe(state, !boxed, generation)
  const screened = useBreakTitle(state, tracker) !== null
  const started = useStarted(state, ctx.emulator, ctx.tailgate)
  const band = useLowerTicker(events, tracker, boxed, generation)
  const pregame = usePregame(state, generation)
  const away = state?.teams[0].abbr ?? ''
  const home = state?.teams[1].abbr ?? ''
  const abbrs = useMemo<[string, string]>(() => [away, home], [away, home])
  const records = ctx.league.records
  const romSha1 = ctx.rom?.sha1 ?? ''
  const data = useMemo<TsbView>(
    () => ({ state, final, tracker, events, player, helmets, records, boxed, pregame, started, wipe, band, screened, romSha1, abbrs }),
    [state, final, tracker, events, player, helmets, records, boxed, pregame, started, wipe, band, screened, romSha1, abbrs],
  )
  const phase = phaseOf(state, boxed, pregame)
  const { sidecar, restore, suspend, resume } = game
  return useMemo(() => ({ data, phase, generation, save: sidecar, restore, suspend, resume }), [data, phase, generation, sidecar, restore, suspend, resume])
}
