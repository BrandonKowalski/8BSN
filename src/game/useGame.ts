import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../emu/Emulator'
import { emptySnapshot } from '../emu/snapshot'
import { decodeGameState } from './decode'
import { breakLabel, playerName } from './format'
import { startersAt } from './lineups'
import { TSB2026_MAP, ROUTES_ENABLED } from './maps/tsb2026'
import { PlayTracker, type TrackerEvent, type TrackerSidecar } from './playTracker'
import { rosterOf, type RomImage } from './roms'
import type { RosterPlayer, RosterTeam } from './roster'
import type { GameState } from './types'

const COMMIT_INTERVAL_MS = 100
export const MENU_FRAMES = 30

type Committed = { state: GameState | null; events: TrackerEvent[]; generation: number; final: GameState | null }

export type NameLookup = (team: 0 | 1, rosterIndex: number) => string

export type PlayerLookup = (team: 0 | 1, rosterIndex: number) => RosterPlayer | null

export type GameSidecar = { tracker: TrackerSidecar; lastInGame: GameState | null }

export type Game = {
  state: GameState | null
  final: GameState | null
  tracker: PlayTracker
  events: TrackerEvent[]
  generation: number
  names: NameLookup
  player: PlayerLookup
  sidecar: () => GameSidecar
  restore: (sidecar: GameSidecar | null, frame: number) => void
  suspend: () => void
  resume: () => void
}

export function breakView(last: GameState | null, now: GameState): GameState {
  const base = last ?? { ...now, quarter: Math.max(0, now.quarter - 1) }
  return {
    ...base,
    inGame: false,
    inBreak: true,
    live: false,
    playSelect: false,
    betweenPlays: false,
    playOver: false,
    teams: now.teams,
    clock: { min: 0, sec: 0 },
    positions: [],
    frame: now.frame,
  }
}

export function menuFrames(prev: number, decoded: GameState, last: GameState | null, onScoreboard: boolean): number {
  if (!decoded.inBreak || !last) return -1
  if (prev >= MENU_FRAMES) return prev
  if (breakLabel(last.quarter, decoded.teams) !== 'FINAL') return -1
  return onScoreboard ? 0 : prev + 1
}

export function useGame(emu: Emulator | null, rom: RomImage | null): Game {
  const rosterRef = useRef<RosterTeam[]>([])
  const latestRef = useRef<GameState | null>(null)
  const lastInGameRef = useRef<GameState | null>(null)
  const player = useCallback<PlayerLookup>((side, rosterIndex) => {
    const id = latestRef.current?.teams[side].id
    const team = rosterRef.current.find((t) => t.id === id)
    return team?.players[rosterIndex] ?? null
  }, [])
  const names = useCallback<NameLookup>((side, rosterIndex) => {
    const found = player(side, rosterIndex)
    return found ? playerName(found, 'last') : ''
  }, [player])
  const snapRef = useRef(emptySnapshot())
  const tracker = useMemo(
    () => new PlayTracker({ recordRoutes: ROUTES_ENABLED, names, lineup: (team, unit) => startersAt(snapRef.current, TSB2026_MAP, team, unit) }),
    [emu, names],
  )
  const batchRef = useRef<TrackerEvent[]>([])
  const generationRef = useRef(0)
  const suspendedRef = useRef(false)
  const floorRef = useRef(0)
  const [committed, setCommitted] = useState<Committed>({ state: null, events: [], generation: 0, final: null })

  useLayoutEffect(() => {
    batchRef.current = []
  })

  useEffect(() => {
    if (!emu || !rom) {
      latestRef.current = null
      setCommitted({ state: null, events: [], generation: generationRef.current, final: null })
      return
    }
    rosterRef.current = rosterOf(rom)
    const roster = rosterRef.current
    const scratch = snapRef.current
    let lastFrame = -1
    let lastCommit = Number.NEGATIVE_INFINITY
    let pending: TrackerEvent[] = []
    let current: GameState | null = null
    let menus = -1
    let scoreboard: GameState | null = null
    let final: GameState | null = null
    lastInGameRef.current = null
    let dirty = false
    let raf = 0
    let generation = generationRef.current
    floorRef.current = 0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (generation !== generationRef.current) {
        generation = generationRef.current
        menus = -1
        scoreboard = null
        final = null
        pending = []
        dirty = false
        batchRef.current = []
      }
      if (emu.readSnapshot(scratch) && scratch.frame !== lastFrame) {
        lastFrame = scratch.frame
        if (suspendedRef.current || scratch.frame < floorRef.current) return
        const decoded = decodeGameState(scratch, TSB2026_MAP, roster)
        if (decoded.inGame) lastInGameRef.current = decoded
        latestRef.current = decoded
        const screen = TSB2026_MAP.breakScreen
        const onScoreboard = scratch.ram[screen.addr.offset] === screen.scoreboard
        const wasMenus = menus >= MENU_FRAMES
        menus = menuFrames(menus, decoded, lastInGameRef.current, onScoreboard)
        if (decoded.inGame) final = null
        else if (menus >= 0 && onScoreboard) scoreboard = breakView(lastInGameRef.current, decoded)
        if (!wasMenus && menus >= MENU_FRAMES) final = scoreboard
        current = !decoded.inBreak ? decoded : menus >= MENU_FRAMES ? { ...decoded, inBreak: false } : breakView(lastInGameRef.current, decoded)
        dirty = true
        pending.push(...tracker.push(decoded))
      }
      if (dirty && (pending.length > 0 || now - lastCommit >= COMMIT_INTERVAL_MS)) {
        const events = pending
        pending = []
        dirty = false
        lastCommit = now
        batchRef.current = [...batchRef.current, ...events]
        setCommitted({ state: current, events: batchRef.current, generation, final })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [emu, rom, tracker])

  const sidecar = useCallback((): GameSidecar => ({ tracker: tracker.sidecar(), lastInGame: structuredClone(lastInGameRef.current) }), [tracker])
  const restore = useCallback(
    (saved: GameSidecar | null, frame: number) => {
      if (saved) tracker.restore(saved.tracker)
      else tracker.reset()
      lastInGameRef.current = saved ? structuredClone(saved.lastInGame) : null
      generationRef.current += 1
      floorRef.current = frame
      suspendedRef.current = false
    },
    [tracker],
  )
  const suspend = useCallback(() => {
    suspendedRef.current = true
  }, [])
  const resume = useCallback(() => {
    suspendedRef.current = false
  }, [])

  return { state: committed.state, final: committed.final, tracker, events: committed.events, generation: committed.generation, names, player, sidecar, restore, suspend, resume }
}
