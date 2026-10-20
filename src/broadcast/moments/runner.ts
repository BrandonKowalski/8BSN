import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../emu/Emulator'
import type { Clip } from '../../emu/recorder'
import { ReplayPlayer } from '../../emu/ReplayPlayer'
import type { MomentCall, ReplayCall, ReplayView } from '../../sdk/types'
import { LEAD_IN_MS } from './ReplayLeadIn'

export const REPLAY_SPEED = 0.75
export const REPLAY_HOLD_MS = 400

export type Shown = { call: MomentCall; ready: boolean; leadIn: boolean; player: ReplayPlayer | null }

export type ClipRunner = {
  shown: Shown | null
  launch: (call: MomentCall, then?: () => void) => void
  end: () => void
  ready: (shown: Shown | null, skip: () => void) => ReplayView | null
}

export function useClipRunner(emulator: Emulator | null, rom: Uint8Array | null): ClipRunner {
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
    (call: MomentCall, then?: () => void) => {
      halt()
      const id = run.current
      if (call.kind === 'graphic') {
        after.current = then ?? null
        setShown({ call, ready: true, leadIn: false, player: null })
        lead.current = setTimeout(() => finish(id), call.ms)
        return
      }
      if (!emulator || !rom) {
        setShown(null)
        then?.()
        return
      }
      after.current = then ?? null
      setShown({ call, ready: false, leadIn: true, player: null })
      void emulator
        .clip(call.clip.from, call.clip.to)
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
    (s: Shown | null, skip: () => void): ReplayView | null =>
      s?.ready ? { call: s.call, leadIn: s.leadIn, player: s.player, canvas: s.leadIn || s.call.kind === 'graphic' ? null : canvas, skip } : null,
    [canvas],
  )

  return { shown, launch, end, ready }
}

export type Reel = { view: ReplayView | null; at: number | null; total: number; done: boolean }

type ReelArgs = { emulator: Emulator | null; rom: Uint8Array | null; calls: readonly ReplayCall[]; active: boolean }

export function useReel({ emulator, rom, calls, active }: ReelArgs): Reel {
  const { shown, launch, end, ready } = useClipRunner(emulator, rom)
  const [at, setAt] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  useLayoutEffect(() => {
    if (!active) return
    if (!emulator || !rom || calls.length === 0) {
      setDone(true)
      return () => setDone(false)
    }
    const go = (i: number) => {
      if (i >= calls.length) {
        setAt(null)
        setDone(true)
        return
      }
      setAt(i)
      launch(calls[i], () => go(i + 1))
    }
    go(0)
    return () => {
      end()
      setAt(null)
      setDone(false)
    }
  }, [active, emulator, rom, calls, launch, end])

  const view = useMemo(() => (active ? ready(shown, end) : null), [active, shown, ready, end])
  return { view, at: active ? at : null, total: calls.length, done: active && done }
}
