import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Wordmark from '../brand/Wordmark'
import type { Emulator } from '../emu/Emulator'
import { NETWORK_KEYS, resolveBindings, useActions } from '../input/actions'
import { leagueData } from '../league/leagueData'
import { useLeague } from '../league/useLeague'
import { useStandings } from '../league/useStandings'
import { useSaveStates } from '../saves/useSaveStates'
import type { ActionPulse, BroadcastPackage, Layout, LeagueGame, Paging, Phase, Records, Region, RomInfo, SessionContext, SlotProps, TailgatePick } from '../sdk/types'
import { useTailgate, useTailgateHold, type TailgateInput } from '../tailgate/useTailgate'
import { DEFAULT_LAYOUT, gameStyle, regionStyle } from './layout'
import LeagueTicker from './LeagueTicker'
import MomentStage from './moments/MomentStage'
import { useMoments } from './moments/useMoments'
import './station.css'

export const ENTER_MS = 400
const NEUTRAL = { primary: '#333', secondary: '#999' }
const NETWORK = new Set(Object.keys(NETWORK_KEYS))
const noop = () => undefined

export type SlotRef = (node: HTMLDivElement | null) => void

export type Feed = { games: LeagueGame[] | null; records: Records | null }

export type StationProps = {
  pkg: BroadcastPackage
  emulator: Emulator | null
  rom: { bytes: Uint8Array; rom: RomInfo } | null
  canvasSlot: SlotRef
  forceWindow: boolean
  onForceWindow?: () => void
  tailgate: boolean
  asking: boolean
  onTailgateFinal: () => void
  onTailgateInput: (input: TailgateInput) => void
  saves: boolean
  toast: (text: string | null) => void
  feed?: Feed
}

function useEntering(active: boolean): boolean {
  const [was, setWas] = useState(active)
  const [entering, setEntering] = useState(false)
  if (was !== active) {
    setWas(active)
    setEntering(!active)
  }
  useEffect(() => {
    if (!entering) return
    const timer = setTimeout(() => setEntering(false), ENTER_MS)
    return () => clearTimeout(timer)
  }, [entering])
  return entering && !active
}

function RegionBox({ layout, name, phase, children }: { layout: Layout; name: Region; phase: Phase; children?: ReactNode }) {
  const style = regionStyle(layout, name, phase)
  return (
    <div className={`bc-region bc-region-${name}`} data-testid={`region-${name}`} style={style ?? undefined} hidden={style === null}>
      {children}
    </div>
  )
}

export default function Station({ pkg, emulator, rom, canvasSlot, forceWindow, onForceWindow = noop, tailgate, asking, onTailgateFinal, onTailgateInput, saves, toast, feed }: StationProps) {
  const path = feed ? null : (pkg.league?.path ?? null)
  const fetched = useLeague(path)
  const standings = useStandings(path)
  const games = feed ? feed.games : fetched
  const records = feed ? feed.records : standings
  const league = useMemo(() => leagueData(pkg.league, games, records), [pkg.league, games, records])
  const bytes = rom?.bytes ?? null
  const sha1 = rom?.rom.sha1 ?? null
  const image = useMemo(() => (bytes && sha1 !== null ? { bytes, sha1 } : null), [bytes, sha1])
  const [action, setAction] = useState<ActionPulse>(null)
  const ctx = useMemo<SessionContext>(() => ({ emulator, rom: image, forceWindow, tailgate, league, action }), [emulator, image, forceWindow, tailgate, league, action])
  const session = pkg.useSession(ctx)
  const { data, phase, generation } = session
  const saved = useSaveStates(emulator, session, saves, sha1, pkg.id)
  useEffect(() => {
    toast(saved)
  }, [toast, saved])
  useEffect(() => () => toast(null), [toast])
  const open = phase === 'window'
  const { view: replay, def, waiting, call, skip } = useMoments({ emulator, rom: bytes, moments: pkg.slots.moments, data, open, generation })
  const covered = replay !== null || waiting
  const pick = useMemo<TailgatePick | null>(() => (sha1 === null ? null : { games, toRom: league.toRom, sha1, random: Math.random }), [games, league, sha1])
  const spec = pkg.tailgate
  useTailgate({ emulator, spec, data, pick, active: tailgate, asking, onFinal: onTailgateFinal, onInput: onTailgateInput })
  useTailgateHold(emulator, tailgate && spec !== undefined && spec.hold(data), covered, spec?.holdMs(data) ?? 0)
  const [paging, setPaging] = useState<Paging>({ by: 1, n: 0 })
  const [restart, setRestart] = useState(0)
  const bindings = useMemo(() => resolveBindings(pkg.controls), [pkg.controls])
  const padActions = useMemo(() => [...bindings.pad.values()].some((id) => !NETWORK.has(id)), [bindings])
  useActions(
    bindings,
    (id) => {
      if (id === 'forceWindow') onForceWindow()
      else if (!NETWORK.has(id)) setAction((p) => ({ id, n: (p?.n ?? 0) + 1 }))
      else if (id === 'replay') call()
      else if (id === 'skip') skip()
      else if (covered) return
      else if (id === 'restart') setRestart((n) => n + 1)
      else setPaging((p) => ({ by: id === 'prevPage' ? -1 : 1, n: p.n + 1 }))
    },
    (id) => id === 'forceWindow' || !NETWORK.has(id) || (open && (id !== 'skip' || covered)),
    open || padActions,
  )
  const layout = pkg.layout ?? DEFAULT_LAYOUT
  const shows = (region: Region) => regionStyle(layout, region, phase) !== null
  const { Scorebug, Pregame, moments, Stats, left, tickers, Breaks, Postgame } = pkg.slots
  const Base = moments?.Base
  const Moment = def?.Render
  const Left = left?.entries.find((entry) => entry.when(data)) ?? null
  const Fallback = left?.Fallback
  const Ticker = tickers?.find((ticker) => ticker.when(data)) ?? null
  const entering = useEntering(Ticker !== null)
  const slot: SlotProps<unknown> = { data, phase, generation, emulator, rom: bytes, league, paging, restart, covered }
  const color = (abbr: string) => pkg.league?.colors?.[abbr] ?? NEUTRAL
  return (
    <div className="view view-broadcast" data-testid="broadcast-view">
      <div className={covered ? 'bc-stage covered' : 'bc-stage'} data-phase={phase} data-testid="bc-stage" style={{ '--box-left': layout.game.window.x } as CSSProperties}>
        <div className="bc-game" style={gameStyle(layout, phase)}>
          <div className="canvas-slot" ref={canvasSlot} />
        </div>
        <RegionBox layout={layout} name="replay" phase={phase}>
          {shows('replay') && replay && Moment && (
            <MomentStage view={replay}>
              <Moment {...slot} view={replay} />
            </MomentStage>
          )}
        </RegionBox>
        <RegionBox layout={layout} name="top" phase={phase}>
          {shows('top') && Base && <Base {...slot} />}
        </RegionBox>
        <RegionBox layout={layout} name="stats" phase={phase}>
          {shows('stats') && Stats && <Stats {...slot} />}
        </RegionBox>
        <RegionBox layout={layout} name="left" phase={phase}>
          {shows('left') && (Left ? <Left.Render key={Left.id} {...slot} /> : Fallback && <Fallback {...slot} />)}
        </RegionBox>
        <RegionBox layout={layout} name="ticker" phase={phase}>
          {Ticker ? shows('ticker') && <Ticker.Render key={Ticker.id} {...slot} /> : <LeagueTicker games={games} entering={entering} color={color} detail={pkg.league?.detail} />}
        </RegionBox>
        <RegionBox layout={layout} name="scorebug" phase={phase}>
          {shows('scorebug') && Scorebug && <Scorebug {...slot} />}
        </RegionBox>
        <RegionBox layout={layout} name="watermark" phase={phase}>
          <div className="bc-watermark" data-testid="watermark">
            <Wordmark variant="c3" />
          </div>
        </RegionBox>
        {Pregame && <Pregame {...slot} />}
        {Breaks && <Breaks {...slot} />}
        {Postgame && <Postgame {...slot} onPostgameDone={tailgate ? onTailgateFinal : undefined} />}
      </div>
    </div>
  )
}
