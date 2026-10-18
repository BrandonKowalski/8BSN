import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../../emu/Emulator'
import { ReplayPlayer } from '../../../emu/ReplayPlayer'
import { pickLook, replayWorthy, type Look } from '../../../game/analysis'
import type { PlayResult, PlayTracker, TrackerEvent } from '../../../game/playTracker'

export const SCORING_WIPE_MS = 2000
export const STILL_LOOK_MS = 7000
const CLIP_TAIL_FRAMES = 60
const SKIP_KEY = 'Backspace'
const SKIP_BUTTONS = [4, 5]

export type ReplayView = { play: PlayResult; look: Look; player: ReplayPlayer | null; canvas: HTMLCanvasElement | null; skip: () => void }

type Args = { emulator: Emulator | null; rom: Uint8Array | null; tracker: PlayTracker; events: TrackerEvent[]; boxed: boolean; random?: () => number }
type Pending = { play: PlayResult; at: number }
type Shown = { play: PlayResult; look: Look; player: ReplayPlayer | null }

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
  const handled = useRef<{ tracker: PlayTracker; index: number } | null>(null)
  const previous = useRef<Look | null>(null)
  const player = useRef<ReplayPlayer | null>(null)
  const run = useRef(0)
  const randomRef = useRef(random)
  randomRef.current = random

  const halt = useCallback(() => {
    run.current += 1
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

  const launch = useCallback(
    (play: PlayResult) => {
      halt()
      const id = run.current
      const look = pickLook(play, previous.current, randomRef.current)
      previous.current = look
      setShown({ play, look, player: null })
      if (look !== 'footage') return
      if (!emulator || !rom) {
        toTopdown(id)
        return
      }
      void (async () => {
        try {
          const clip = await emulator.clip(play.startFrame, play.endFrame + CLIP_TAIL_FRAMES)
          if (id !== run.current) return
          if (!clip) {
            toTopdown(id)
            return
          }
          const started = await ReplayPlayer.start(emulator, rom, clip, canvas)
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
    [emulator, rom, canvas, halt, end, toTopdown],
  )

  useLayoutEffect(
    () => () => {
      halt()
      setShown(null)
      setPending(null)
    },
    [emulator, rom, tracker, halt],
  )

  useEffect(() => {
    for (const event of events) {
      if (event.type === 'snap') {
        setPending(null)
        end()
      } else if (event.type === 'playEnd') {
        const { play } = event
        if (handled.current?.tracker === tracker && handled.current.index === play.index) continue
        handled.current = { tracker, index: play.index }
        if (replayWorthy(play)) setPending({ play, at: performance.now() + (scored(play) ? SCORING_WIPE_MS : 0) })
      }
    }
  }, [events, tracker, end])

  useEffect(() => {
    if (!pending || !boxed) return
    const go = () => {
      setPending(null)
      launch(pending.play)
    }
    const wait = pending.at - performance.now()
    if (wait <= 0) {
      go()
      return
    }
    const timer = setTimeout(go, wait)
    return () => clearTimeout(timer)
  }, [pending, boxed, launch])

  useLayoutEffect(() => {
    if (!boxed) end()
  }, [boxed, end])

  const visible = boxed && shown !== null
  const still = visible && shown.look !== 'footage'

  useEffect(() => {
    if (!still) return
    const timer = setTimeout(end, STILL_LOOK_MS)
    return () => clearTimeout(timer)
  }, [still, shown?.play, shown?.look, end])

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
    () => (visible && shown ? { ...shown, canvas: shown.look === 'footage' ? canvas : null, skip: end } : null),
    [visible, shown, canvas, end],
  )
}
