import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../../emu/Emulator'
import type { Clip } from '../../../emu/recorder'
import { ReplayPlayer } from '../../../emu/ReplayPlayer'
import { pickLook, playOfDrive, replayWorthy, type Look } from '../../../game/analysis'
import type { Drive, PlayResult, PlayTracker, TrackerEvent } from '../../../game/playTracker'
import { drivePlays } from '../../../game/teamStats'
import { LEAD_IN_MS } from './ReplayLeadIn'
import { topDownMs } from './TopDownLook'

export const SCORING_WIPE_MS = 2000
export const STILL_LOOK_MS = 7000
export const REPLAY_SPEED = 0.75
const CLIP_TAIL_FRAMES = 60
const SKIP_KEY = 'Backspace'
const SKIP_BUTTONS = [4, 5]
export const INSTANT_REPLAY = 'INSTANT REPLAY'
export const PLAY_OF_THE_DRIVE = 'PLAY OF THE DRIVE'

export type ReplayView = { play: PlayResult; label: string; look: Look; leadIn: boolean; player: ReplayPlayer | null; canvas: HTMLCanvasElement | null; skip: () => void }

type Args = { emulator: Emulator | null; rom: Uint8Array | null; tracker: PlayTracker; events: TrackerEvent[]; boxed: boolean; random?: () => number }
type Pending = { play: PlayResult; at: number }
type Shown = { play: PlayResult; label: string; look: Look; leadIn: boolean; player: ReplayPlayer | null }
type Watched = { tracker: PlayTracker; plays: readonly PlayResult[]; last: Drive | null }

export function lookMs(look: Look, play: PlayResult, rate = 1): number {
  return (look === 'topdown' ? topDownMs(play, rate) : null) ?? STILL_LOOK_MS
}

const scored = (play: PlayResult) => play.scoreAfter[0] !== play.scoreBefore[0] || play.scoreAfter[1] !== play.scoreBefore[1]

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

function shoulderPressed() {
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (pad && SKIP_BUTTONS.some((i) => pad.buttons[i]?.pressed)) return true
  }
  return false
}

export function useReplay({ emulator, rom, tracker, events, boxed, random = Math.random }: Args): ReplayView | null {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const [pending, setPending] = useState<Pending | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [queued, setQueued] = useState<PlayResult | null>(null)
  const replayed = useRef(new Set<number>())
  const watched = useRef<Watched | null>(null)
  const handled = useRef<{ tracker: PlayTracker; index: number } | null>(null)
  const previous = useRef<Look | null>(null)
  const player = useRef<ReplayPlayer | null>(null)
  const lead = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const run = useRef(0)
  const randomRef = useRef(random)
  randomRef.current = random

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

  const toTopdown = useCallback(
    (id: number) => {
      if (id !== run.current) return
      const running = player.current
      player.current = null
      running?.stop()
      setShown((s) => s && { ...s, look: 'topdown', player: null })
    },
    [],
  )

  const roll = useCallback(
    (id: number, fetched: Promise<Clip | null> | null) => {
      if (!emulator || !rom || !fetched) {
        toTopdown(id)
        return
      }
      void (async () => {
        try {
          const clip = await fetched
          if (id !== run.current) return
          if (!clip) {
            toTopdown(id)
            return
          }
          const started = await ReplayPlayer.start(emulator, rom, clip, canvas, REPLAY_SPEED)
          if (id !== run.current) {
            started.stop()
            return
          }
          player.current = started
          setShown((s) => s && { ...s, player: started })
          started.onEnd((reason) => {
            if (id !== run.current) return
            if (reason === 'diverged') toTopdown(id)
            else end()
          })
        } catch {
          toTopdown(id)
        }
      })()
    },
    [emulator, rom, canvas, end, toTopdown],
  )

  const launch = useCallback(
    (play: PlayResult, label: string) => {
      halt()
      const id = run.current
      const look = pickLook(play, previous.current, randomRef.current)
      previous.current = look
      if (label === INSTANT_REPLAY) replayed.current.add(play.index)
      setShown({ play, label, look, leadIn: true, player: null })
      const fetched = look === 'footage' && emulator && rom ? emulator.clip(play.startFrame, play.endFrame + CLIP_TAIL_FRAMES).catch(() => null) : null
      lead.current = setTimeout(() => {
        if (id !== run.current) return
        setShown((s) => s && { ...s, leadIn: false })
        if (look === 'footage') roll(id, fetched)
      }, LEAD_IN_MS)
    },
    [emulator, rom, halt, roll],
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
  const still = visible && !shown.leadIn && shown.look !== 'footage'

  useEffect(() => {
    if (!still || !shown) return
    const timer = setTimeout(end, lookMs(shown.look, shown.play, REPLAY_SPEED))
    return () => clearTimeout(timer)
  }, [still, shown, end])

  useEffect(() => {
    if (!visible) return
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== SKIP_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      end()
    }
    window.addEventListener('keydown', onKey)
    let held = shoulderPressed()
    let raf = 0
    const poll = () => {
      const pressed = shoulderPressed()
      if (pressed && !held) {
        end()
        return
      }
      held = pressed
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
    }
  }, [visible, end])

  return useMemo(
    () => (visible && shown ? { ...shown, canvas: shown.look === 'footage' && !shown.leadIn ? canvas : null, skip: end } : null),
    [visible, shown, canvas, end],
  )
}
