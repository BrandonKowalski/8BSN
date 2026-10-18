import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../../emu/Emulator'
import type { Clip } from '../../../emu/recorder'
import { ReplayPlayer } from '../../../emu/ReplayPlayer'
import { playOfDrive, replayWorthy } from '../../../game/analysis'
import type { Drive, PlayResult, PlayTracker, TrackerEvent } from '../../../game/playTracker'
import { drivePlays } from '../../../game/teamStats'
import { LEAD_IN_MS } from './ReplayLeadIn'

export const SCORING_WIPE_MS = 2000
export const REPLAY_SPEED = 0.75
export const CLIP_TAIL_FRAMES = 20
const SKIP_KEY = 'Backspace'
export const INSTANT_REPLAY = 'INSTANT REPLAY'
export const PLAY_OF_THE_DRIVE = 'PLAY OF THE DRIVE'

export type ReplayView = { play: PlayResult; label: string; leadIn: boolean; player: ReplayPlayer | null; canvas: HTMLCanvasElement | null; skip: () => void }

type Args = { emulator: Emulator | null; rom: Uint8Array | null; tracker: PlayTracker; events: TrackerEvent[]; boxed: boolean }
type Pending = { play: PlayResult; at: number }
type Shown = { play: PlayResult; label: string; ready: boolean; leadIn: boolean; player: ReplayPlayer | null }
type Watched = { tracker: PlayTracker; plays: readonly PlayResult[]; last: Drive | null }

const scored = (play: PlayResult) => play.scoreAfter[0] !== play.scoreBefore[0] || play.scoreAfter[1] !== play.scoreBefore[1]

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export type ReplayState = { view: ReplayView | null; waiting: boolean; call: () => void }

export function useReplay(args: Args): ReplayView | null {
  return useReplayState(args).view
}

export function useReplayState({ emulator, rom, tracker, events, boxed }: Args): ReplayState {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const [pending, setPending] = useState<Pending | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [queued, setQueued] = useState<PlayResult | null>(null)
  const replayed = useRef(new Set<number>())
  const watched = useRef<Watched | null>(null)
  const handled = useRef<{ tracker: PlayTracker; index: number } | null>(null)
  const player = useRef<ReplayPlayer | null>(null)
  const lead = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const run = useRef(0)

  const halt = useCallback(() => {
    run.current += 1
    clearTimeout(lead.current)
    const running = player.current
    player.current = null
    running?.stop()
  }, [])

  const end = useCallback(() => {
    halt()
    setShown(null)
  }, [halt])

  const skip = useCallback(
    (id: number) => {
      if (id === run.current) end()
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
          started.onEnd(() => skip(id))
        } catch {
          skip(id)
        }
      })()
    },
    [canvas, skip],
  )

  const launch = useCallback(
    (play: PlayResult, label: string) => {
      halt()
      if (label === INSTANT_REPLAY) replayed.current.add(play.index)
      if (!emulator || !rom) {
        setShown(null)
        return
      }
      const id = run.current
      setShown({ play, label, ready: false, leadIn: true, player: null })
      void emulator
        .clip(play.startFrame, play.endFrame + CLIP_TAIL_FRAMES)
        .catch(() => null)
        .then((clip) => {
          if (id !== run.current) return
          if (!clip) {
            end()
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
    [emulator, rom, halt, end, roll],
  )

  useLayoutEffect(
    () => () => {
      halt()
      setShown(null)
      setPending(null)
      setQueued(null)
      replayed.current = new Set()
    },
    [emulator, rom, tracker, halt],
  )

  useEffect(() => {
    for (const event of events) {
      if (event.type === 'snap') {
        setPending(null)
        setQueued(null)
        end()
      } else if (event.type === 'playEnd') {
        const { play } = event
        if (handled.current?.tracker === tracker && handled.current.index === play.index) continue
        handled.current = { tracker, index: play.index }
        if (replayWorthy(play)) setPending({ play, at: performance.now() + (scored(play) ? SCORING_WIPE_MS : 0) })
      }
    }
  }, [events, tracker, end])

  useLayoutEffect(() => {
    if (!pending || !boxed) return
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
  }, [pending, boxed, launch])

  const plays = tracker.plays()
  const last = tracker.lastDrive()

  useEffect(() => {
    const seen = watched.current
    watched.current = { tracker, plays, last }
    if (seen?.tracker === tracker && seen.plays !== plays) {
      replayed.current = new Set()
      setQueued(null)
    }
    if (!seen || seen.tracker !== tracker || seen.plays !== plays || seen.last === last || !last) return
    const groups = drivePlays(plays, tracker.drives().filter((d) => d.result !== 'IN_PROGRESS'))
    const best = playOfDrive(groups[groups.length - 1] ?? [], last)
    if (best) setQueued(best)
  }, [tracker, plays, last])

  useLayoutEffect(() => {
    if (!queued || !boxed || pending || shown) return
    setQueued(null)
    if (!replayed.current.has(queued.index)) launch(queued, PLAY_OF_THE_DRIVE)
  }, [queued, boxed, pending, shown, launch])

  useLayoutEffect(() => {
    if (boxed) return
    setPending(null)
    setQueued(null)
    end()
  }, [boxed, end])

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

  const view = useMemo(
    () => (visible && shown?.ready ? { play: shown.play, label: shown.label, leadIn: shown.leadIn, player: shown.player, canvas: shown.leadIn ? null : canvas, skip: end } : null),
    [visible, shown, canvas, end],
  )
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
