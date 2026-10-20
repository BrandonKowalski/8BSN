import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Emulator } from '../../emu/Emulator'
import type { MomentCall, MomentDef, Moments, ReplayView } from '../../sdk/types'
import { useClipRunner } from './runner'

type Args<S> = { emulator: Emulator | null; rom: Uint8Array | null; moments: Moments<S> | undefined; data: S | null; open: boolean; generation: number }
type Queued<S> = { call: MomentCall; def: MomentDef<S>; at: number }
type Epoch = { generation: number; emulator: Emulator | null; rom: Uint8Array | null }

export type MomentsState<S> = { view: ReplayView | null; def: MomentDef<S> | null; waiting: boolean; call: () => void; skip: () => void }

const NONE: readonly never[] = []

export function useMoments<S>({ emulator, rom, moments, data, open, generation }: Args<S>): MomentsState<S> {
  const { shown, launch, end, ready } = useClipRunner(emulator, rom)
  const [queue, setQueue] = useState<readonly Queued<S>[]>(NONE)
  const [current, setCurrent] = useState<Queued<S> | null>(null)
  const seen = useRef(new Set<string>())
  const ran = useRef(new Set<string>())
  const epoch = useRef<Epoch | null>(null)
  const baselined = useRef(false)
  const tick = useRef(0)
  const last = useRef<{ data: S | null; open: boolean }>({ data: null, open })

  const clear = useCallback(() => {
    setQueue(NONE)
    ran.current = new Set()
    end()
  }, [end])

  const start = useCallback(
    (call: MomentCall, def: MomentDef<S>) => {
      ran.current.add(call.subject)
      tick.current += 1
      setCurrent({ call, def, at: tick.current })
      launch(call)
    },
    [launch],
  )

  useLayoutEffect(() => {
    const was = epoch.current
    if (!was || was.generation !== generation || was.emulator !== emulator || was.rom !== rom) {
      epoch.current = { generation, emulator, rom }
      seen.current = new Set()
      baselined.current = false
      clear()
    } else if (last.current.open && !open) clear()
    const fresh = data !== last.current.data
    last.current = { data, open }
    if (data === null || !moments) return
    if (!baselined.current) {
      baselined.current = true
      for (const def of moments.defs) {
        const found = def.when(data)
        if (found) seen.current.add(found.key)
      }
      return
    }
    if (!fresh) return
    const added: Queued<S>[] = []
    for (const def of moments.defs) {
      const found = def.when(data)
      if (!found || seen.current.has(found.key)) continue
      seen.current.add(found.key)
      added.push({ call: found, def, at: (tick.current += 1) })
    }
    if (moments.cancel?.(data)) {
      clear()
      return
    }
    if (added.length > 0) setQueue((q) => [...q, ...added])
  }, [data, open, generation, emulator, rom, moments, clear])

  const deferred = data !== null && moments?.defer?.(data) === true

  useLayoutEffect(() => {
    if (!open || deferred || queue.length === 0) return
    const next = queue.reduce((best, q) => (q.def.priority > best.def.priority ? q : best))
    if (ran.current.has(next.call.subject)) {
      setQueue((q) => q.filter((x) => x !== next))
      return
    }
    if (shown && current && (next.at < current.at || next.def.priority < current.def.priority)) return
    setQueue((q) => q.filter((x) => x !== next))
    start(next.call, next.def)
  }, [queue, open, deferred, shown, current, start])

  const call = useCallback(() => {
    if (!open) return
    if (shown) {
      end()
      return
    }
    const manual = moments?.manual
    if (data === null || !manual) return
    const found = manual.when(data)
    if (found) start(found, manual)
  }, [open, shown, end, moments, data, start])

  const view = useMemo(() => (open && shown ? ready(shown, end) : null), [open, shown, ready, end])
  const def = view && current ? current.def : null
  const waiting = open && ((queue.length > 0 && shown === null) || (shown !== null && !shown.ready))
  return useMemo(() => ({ view, def, waiting, call, skip: end }), [view, def, waiting, call, end])
}
