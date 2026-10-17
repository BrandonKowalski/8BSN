import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../emu/Emulator'
import { emptySnapshot } from '../emu/snapshot'
import { decodeGameState } from './decode'
import { TSB2026_MAP, ROUTES_ENABLED } from './maps/tsb2026'
import { PlayTracker, type TrackerEvent } from './playTracker'
import { parseRoster, type RosterTeam } from './roster'
import type { GameState } from './types'

const COMMIT_INTERVAL_MS = 100

type Committed = { state: GameState | null; events: TrackerEvent[] }

export function useGame(emu: Emulator | null, rom: Uint8Array | null): { state: GameState | null; tracker: PlayTracker; events: TrackerEvent[] } {
  const rosterRef = useRef<RosterTeam[]>([])
  const latestRef = useRef<GameState | null>(null)
  const tracker = useMemo(
    () =>
      new PlayTracker({
        recordRoutes: ROUTES_ENABLED,
        names: (side, rosterIndex) => {
          const id = latestRef.current?.teams[side].id
          const team = rosterRef.current.find((t) => t.id === id)
          return (team?.players[rosterIndex]?.last ?? '').toUpperCase()
        },
      }),
    [emu],
  )
  const batchRef = useRef<TrackerEvent[]>([])
  const [committed, setCommitted] = useState<Committed>({ state: null, events: [] })

  useLayoutEffect(() => {
    batchRef.current = []
  })

  useEffect(() => {
    if (!emu || !rom) {
      latestRef.current = null
      setCommitted({ state: null, events: [] })
      return
    }
    rosterRef.current = parseRoster(rom)
    const roster = rosterRef.current
    const scratch = emptySnapshot()
    let lastFrame = -1
    let lastCommit = Number.NEGATIVE_INFINITY
    let pending: TrackerEvent[] = []
    let current: GameState | null = null
    let dirty = false
    let raf = 0

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (emu.readSnapshot(scratch) && scratch.frame !== lastFrame) {
        lastFrame = scratch.frame
        const decoded = decodeGameState(scratch, TSB2026_MAP, roster)
        latestRef.current = decoded
        current = decoded
        dirty = true
        pending.push(...tracker.push(decoded))
      }
      if (dirty && (pending.length > 0 || now - lastCommit >= COMMIT_INTERVAL_MS)) {
        const events = pending
        pending = []
        dirty = false
        lastCommit = now
        batchRef.current = [...batchRef.current, ...events]
        setCommitted({ state: current, events: batchRef.current })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [emu, rom, tracker])

  return { state: committed.state, tracker, events: committed.events }
}
