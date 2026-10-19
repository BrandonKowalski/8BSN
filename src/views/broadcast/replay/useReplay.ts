import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../../emu/Emulator'
import type { Clip } from '../../../emu/recorder'
import { ReplayPlayer } from '../../../emu/ReplayPlayer'
import { playOfDrive, replayWorthy } from '../../../game/analysis'
import type { Drive, PlayResult, PlayTracker, TrackerEvent } from '../../../game/playTracker'
import { drivePlays } from '../../../game/teamStats'
import { typing } from '../../../input/broadcastButtons'
import { LEAD_IN_MS } from './ReplayLeadIn'

export const REPLAY_SPEED = 0.75
export const CLIP_TAIL_FRAMES = 20
export const REPLAY_HOLD_MS = 400
const SKIP_KEY = 'Backspace'
export const INSTANT_REPLAY = 'INSTANT REPLAY'
export const PLAY_OF_THE_DRIVE = 'PLAY OF THE DRIVE'

export type ReplayView = { play: PlayResult; label: string; leadIn: boolean; player: ReplayPlayer | null; canvas: HTMLCanvasElement | null; skip: () => void }

type Args = { emulator: Emulator | null; rom: Uint8Array | null; tracker: PlayTracker; events: TrackerEvent[]; boxed: boolean; celebrating?: boolean; screened?: boolean; generation?: number }
type Pending = { play: PlayResult; at: number }
type Shown = { play: PlayResult; label: string; ready: boolean; leadIn: boolean; player: ReplayPlayer | null }
type Watched = { tracker: PlayTracker; generation: number; plays: readonly PlayResult[]; last: Drive | null }

export type ReplayState = { view: ReplayView | null; waiting: boolean; call: () => void }

export function useReplay(args: Args): ReplayView | null {
  return useReplayState(args).view
}

type Runner = {
  shown: Shown | null
  launch: (play: PlayResult, label: string, then?: () => void) => void
  end: () => void
  ready: (shown: Shown | null, skip: () => void) => ReplayView | null
}

function useReplayRunner(emulator: Emulator | null, rom: Uint8Array | null): Runner {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const [shown, setShown] = useState<Shown | null>(null)
  const player = useRef<ReplayPlayer | null>(null)
  const lead = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const run = useRef(0)
  const after = useRef<(() => void) | null>(null)

  const halt = useCallback(() => {
    run.current += 1
    after.current = null
    clearTimeout(lead.current)
    const running = player.current
    player.current = null
    running?.stop()
  }, [])

  const end = useCallback(() => {
    halt()
    setShown(null)
  }, [halt])

  const finish = useCallback(
    (id: number) => {
      if (id !== run.current) return
      const next = after.current
      end()
      next?.()
    },
    [end],
  )

  const roll = useCallback(
    (id: number, emulator: Emulator, rom: Uint8Array, clip: Clip) => {
      void (async () => {
        try {
          const started = await ReplayPlayer.start(emulator, rom, clip, canvas, REPLAY_SPEED)
          if (id !== run.current) {
            started.stop()
            return
          }
          player.current = started
          setShown((s) => s && { ...s, player: started })
          started.onEnd((reason) => {
            if (reason !== 'done' || id !== run.current) {
              finish(id)
              return
            }
            lead.current = setTimeout(() => finish(id), REPLAY_HOLD_MS)
          })
        } catch {
          finish(id)
        }
      })()
    },
    [canvas, finish],
  )

  const launch = useCallback(
    (play: PlayResult, label: string, then?: () => void) => {
      halt()
      if (!emulator || !rom) {
        setShown(null)
        then?.()
        return
      }
      const id = run.current
      after.current = then ?? null
      setShown({ play, label, ready: false, leadIn: true, player: null })
      void emulator
        .clip(play.startFrame, play.endFrame + CLIP_TAIL_FRAMES)
        .catch(() => null)
        .then((clip) => {
          if (id !== run.current) return
          if (!clip) {
            finish(id)
            return
          }
          setShown((s) => s && { ...s, ready: true })
          lead.current = setTimeout(() => {
            if (id !== run.current) return
            setShown((s) => s && { ...s, leadIn: false })
            roll(id, emulator, rom, clip)
          }, LEAD_IN_MS)
        })
    },
    [emulator, rom, halt, finish, roll],
  )

  useLayoutEffect(() => end, [emulator, rom, end])

  const ready = useCallback(
    (s: Shown | null, skip: () => void) => (s?.ready ? { play: s.play, label: s.label, leadIn: s.leadIn, player: s.player, canvas: s.leadIn ? null : canvas, skip } : null),
    [canvas],
  )

  return { shown, launch, end, ready }
}

export function useReplayState({ emulator, rom, tracker, events, boxed, celebrating = false, screened = false, generation = 0 }: Args): ReplayState {
  const runner = useReplayRunner(emulator, rom)
  const { shown, end } = runner
  const [pending, setPending] = useState<Pending | null>(null)
  const [queued, setQueued] = useState<PlayResult | null>(null)
  const replayed = useRef(new Set<number>())
  const watched = useRef<Watched | null>(null)
  const handled = useRef<{ tracker: PlayTracker; index: number } | null>(null)
  const baseline = useRef({ tracker, generation })

  const launch = useCallback(
    (play: PlayResult, label: string) => {
      if (label === INSTANT_REPLAY) replayed.current.add(play.index)
      runner.launch(play, label)
    },
    [runner.launch],
  )

  useLayoutEffect(
    () => () => {
      end()
      setPending(null)
      setQueued(null)
      replayed.current = new Set()
    },
    [emulator, rom, tracker, end],
  )

  useEffect(() => {
    if (baseline.current.tracker !== tracker || baseline.current.generation !== generation) {
      baseline.current = { tracker, generation }
      handled.current = null
      for (const event of events) if (event.type === 'playEnd') handled.current = { tracker, index: event.play.index }
      replayed.current = new Set()
      setPending(null)
      setQueued(null)
      end()
      return
    }
    for (const event of events) {
      if (event.type === 'snap') {
        setPending(null)
        setQueued(null)
        end()
      } else if (event.type === 'playEnd') {
        const { play } = event
        if (handled.current?.tracker === tracker && handled.current.index === play.index) continue
        handled.current = { tracker, index: play.index }
        if (replayWorthy(play)) setPending({ play, at: performance.now() })
      }
    }
  }, [events, tracker, generation, end])

  useLayoutEffect(() => {
    if (!pending || !boxed || celebrating) return
    const go = () => {
      setPending(null)
      launch(pending.play, INSTANT_REPLAY)
    }
    const wait = pending.at - performance.now()
    if (wait <= 0) {
      go()
      return
    }
    const timer = setTimeout(go, wait)
    return () => clearTimeout(timer)
  }, [pending, boxed, celebrating, launch])

  const plays = tracker.plays()
  const last = tracker.lastDrive()

  useEffect(() => {
    const seen = watched.current
    watched.current = { tracker, generation, plays, last }
    if (seen?.tracker === tracker && seen.plays !== plays) {
      replayed.current = new Set()
      setQueued(null)
    }
    if (!seen || seen.tracker !== tracker || seen.generation !== generation || seen.plays !== plays || seen.last === last || !last) return
    const groups = drivePlays(plays, tracker.drives().filter((d) => d.result !== 'IN_PROGRESS'))
    const best = playOfDrive(groups[groups.length - 1] ?? [], last)
    if (best) setQueued(best)
  }, [tracker, generation, plays, last])

  useLayoutEffect(() => {
    if (!queued || !boxed || celebrating || pending || shown) return
    setQueued(null)
    if (!replayed.current.has(queued.index)) launch(queued, PLAY_OF_THE_DRIVE)
  }, [queued, boxed, celebrating, pending, shown, launch])

  useLayoutEffect(() => {
    if (boxed) return
    setPending(null)
    setQueued(null)
    end()
  }, [boxed, end])

  useLayoutEffect(() => {
    if (!screened) return
    setPending(null)
    setQueued(null)
    end()
  }, [screened, pending, queued, end])

  const visible = boxed && shown !== null

  useEffect(() => {
    if (!visible) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== SKIP_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      end()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, end])

  const view = useMemo(() => (visible ? runner.ready(shown, end) : null), [visible, shown, runner.ready, end])
  const call = useCallback(() => {
    if (!boxed) return
    if (shown) {
      end()
      return
    }
    const list = tracker.plays()
    const latest = list[list.length - 1]
    if (!latest) return
    setPending(null)
    launch(latest, INSTANT_REPLAY)
  }, [boxed, shown, tracker, end, launch])

  const waiting = boxed && ((pending !== null && shown === null) || (shown !== null && !shown.ready))
  return useMemo(() => ({ view, waiting, call }), [view, waiting, call])
}

export type Reel = { view: ReplayView | null; at: number | null; total: number; done: boolean }

type ReelArgs = { emulator: Emulator | null; rom: Uint8Array | null; plays: readonly PlayResult[]; label: string; active: boolean }

export function useReel({ emulator, rom, plays, label, active }: ReelArgs): Reel {
  const { shown, launch, end, ready } = useReplayRunner(emulator, rom)
  const [at, setAt] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  useLayoutEffect(() => {
    if (!active) return
    if (!emulator || !rom || plays.length === 0) {
      setDone(true)
      return () => setDone(false)
    }
    const go = (i: number) => {
      if (i >= plays.length) {
        setAt(null)
        setDone(true)
        return
      }
      setAt(i)
      launch(plays[i], label, () => go(i + 1))
    }
    go(0)
    return () => {
      end()
      setAt(null)
      setDone(false)
    }
  }, [active, emulator, rom, plays, label, launch, end])

  const view = useMemo(() => (active ? ready(shown, end) : null), [active, shown, ready, end])
  return { view, at: active ? at : null, total: plays.length, done: active && done }
}
