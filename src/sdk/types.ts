import type { ComponentType } from 'react'
import type { Emulator } from '../emu/Emulator'
import type { ReplayPlayer } from '../emu/ReplayPlayer'

export type Phase = 'menus' | 'pregame' | 'live' | 'window' | 'break'
export const PHASES: readonly Phase[] = ['menus', 'pregame', 'live', 'window', 'break']
export type TeamColor = { primary: string; secondary: string }
export type RomInfo = { sha1: string; title: string; about: string; unverified?: boolean }
export type RomScan = { ok: true } | { ok: false; reason: string }
export type RomScanner = { about: string; note: string; check: (rom: Uint8Array) => RomScan }
export type Credit = { what: string; who: string }
export type Detail = { label: string; value: string }
export type RamTest = { offset: number; mask?: number; oneOf?: readonly number[]; zero?: boolean }
export type Press = { at: number; mask: number }
export type LeagueGame = {
  id: string
  away: { abbr: string; score: number }
  home: { abbr: string; score: number }
  state: 'pre' | 'in' | 'post'
  detail: string
  date: string
}
export type Records = ReadonlyMap<string, string>
export type LeagueSpec = {
  path: string
  aliases?: Readonly<Record<string, string>>
  colors?: Readonly<Record<string, TeamColor>>
  detail?: (espn: string) => string
}
export type LeagueData = { games: LeagueGame[] | null; records: Records | null; toRom: (abbr: string) => string }
export type NetworkAction = 'prevPage' | 'nextPage' | 'replay' | 'skip' | 'restart' | 'forceWindow'
export type PackageAction = { id: string; pad?: readonly number[]; keys?: readonly string[] }
export type Controls = {
  pad?: Partial<Record<NetworkAction, readonly number[]>>
  actions?: readonly PackageAction[]
}
export type ActionPulse = { id: string; n: number } | null
export type Paging = { by: -1 | 1; n: number }
export type ClipRange = { from: number; to: number }
export type ReplayCall<P = unknown> = {
  kind: 'replay'
  key: string
  subject: string
  clip: ClipRange
  label: string | null
  colors: TeamColor
  payload: P
}
export type GraphicCall<P = unknown> = { kind: 'graphic'; key: string; subject: string; ms: number; payload: P }
export type MomentCall<P = unknown> = ReplayCall<P> | GraphicCall<P>
export type ReplayView<P = unknown> = {
  call: MomentCall<P>
  leadIn: boolean
  player: ReplayPlayer | null
  canvas: HTMLCanvasElement | null
  skip: () => void
}
export type SessionContext = {
  emulator: Emulator | null
  rom: { bytes: Uint8Array; sha1: string } | null
  forceWindow: boolean
  tailgate: boolean
  league: LeagueData
  action: ActionPulse
}
export type Session<S, Saved> = {
  data: S
  phase: Phase
  generation: number
  save: () => Saved
  restore: (saved: Saved | null, frame: number) => void
  suspend: () => void
  resume: () => void
}
export type SlotProps<S> = {
  data: S
  phase: Phase
  generation: number
  emulator: Emulator | null
  rom: Uint8Array | null
  league: LeagueData
  paging: Paging
  restart: number
  covered: boolean
  onPostgameDone?: () => void
}
export type MomentProps<S, P = unknown> = SlotProps<S> & { view: ReplayView<P> }
export type MomentDef<S, P = unknown> = {
  id: string
  priority: number
  when: (data: S) => MomentCall<P> | null
  Render: ComponentType<MomentProps<S, P>>
}
export type Moments<S> = {
  Base?: ComponentType<SlotProps<S>>
  defs: readonly MomentDef<S, any>[]
  manual?: MomentDef<S, any>
  defer?: (data: S) => boolean
  cancel?: (data: S) => boolean
}
export type Conditional<S> = { id: string; when: (data: S) => boolean; Render: ComponentType<SlotProps<S>> }
export type LeftPanel<S> = { entries: readonly Conditional<S>[]; Fallback?: ComponentType<SlotProps<S>> }
export type Slots<S> = {
  Scorebug?: ComponentType<SlotProps<S>>
  Pregame?: ComponentType<SlotProps<S>>
  moments?: Moments<S>
  Stats?: ComponentType<SlotProps<S>>
  left?: LeftPanel<S>
  tickers?: readonly Conditional<S>[]
  Breaks?: ComponentType<SlotProps<S>>
  Postgame?: ComponentType<SlotProps<S>>
}
export type Rect = { x: number; y: number; w: number; h: number }
export type GameRect = { x: number; y: number; w: number }
export type Region = 'top' | 'replay' | 'stats' | 'left' | 'ticker' | 'scorebug' | 'watermark'
export type Placement = { rect: Rect; phases?: Partial<Record<Phase, Rect>>; show: readonly Phase[] }
export type Layout = { game: Record<Phase, GameRect>; regions: Record<Region, Placement> }
export type Snapshot = { ram: Uint8Array; sram: Uint8Array; frame: number }
export type TailgatePick = {
  games: LeagueGame[] | null
  toRom: (abbr: string) => string
  sha1: string
  random: () => number
}
export type Tailgate<S> = {
  label: string
  script: (pick: TailgatePick) => Press[]
  autoInput?: (snapshot: Snapshot, frames: number) => [number, number]
  hold: (data: S) => boolean
  holdMs: (data: S) => number
  finished: (data: S) => boolean
}
export type BroadcastPackage<S = any, Saved = any> = {
  id: string
  name: string
  contract: number
  version: string
  author: string
  about?: readonly Detail[]
  roms: readonly RomInfo[]
  scan?: RomScanner
  credits?: readonly Credit[]
  owners?: readonly string[]
  league?: LeagueSpec
  clipAnchor?: readonly RamTest[]
  controls?: Controls
  layout?: Layout
  tailgate?: Tailgate<S>
  useSession: (ctx: SessionContext) => Session<S, Saved>
  slots: Slots<S>
}
