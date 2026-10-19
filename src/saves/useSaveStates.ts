import { useCallback, useEffect, useRef, useState } from 'react'
import type { Emulator } from '../emu/Emulator'
import type { Game } from '../game/useGame'
import { TARGET_ROM_SHA1 } from '../rom/validateRom'
import { readSlot, SAVE_VERSION, writeSlot } from './saveSlots'

const SLOTS = 4
const TOAST_MS = 1500
const OLD_SAVE_TOAST_MS = 3000

type Saver = Pick<Emulator, 'saveState' | 'loadState'>

function slotOf(code: string): number | null {
  const match = /^Digit([1-9])$/.exec(code)
  const slot = match ? Number(match[1]) : null
  return slot !== null && slot <= SLOTS ? slot : null
}

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function startupSlot(search: string): number | null {
  const value = Number(new URLSearchParams(search).get('state'))
  return Number.isInteger(value) && value >= 1 && value <= SLOTS ? value : null
}

export function useSaveStates(emulator: Saver | null, game: Pick<Game, 'sidecar' | 'restore' | 'suspend' | 'resume'>, enabled: boolean): string | null {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  const busy = useRef(false)
  const { sidecar, restore, suspend, resume } = game

  const show = useCallback((text: string, ms = TOAST_MS) => {
    setToast(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), ms)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const save = useCallback(
    async (emu: Saver, slot: number) => {
      const game = sidecar()
      const { core, frame, recording } = await emu.saveState()
      const meta = { rom: TARGET_ROM_SHA1, savedAt: new Date().toISOString(), sidecar: game, frame, recording }
      await writeSlot(slot, { core, meta })
      show(`SAVED ${slot}`)
    },
    [sidecar, show],
  )

  const load = useCallback(
    async (emu: Saver, slot: number) => {
      const file = await readSlot(slot)
      if (!file) return show(`NO SAVE ${slot}`)
      if (file.meta.rom !== TARGET_ROM_SHA1) return show(`SAVE ${slot} IS FROM ANOTHER ROM`)
      const old = (file.meta.version ?? 0) < SAVE_VERSION
      suspend()
      const frame = file.meta.frame ?? 0
      try {
        await emu.loadState(file.core, frame, old ? null : (file.meta.recording ?? null))
      } catch (error) {
        resume()
        throw error
      }
      restore(old ? null : file.meta.sidecar, frame)
      if (old) return show(`SAVE ${slot} IS FROM AN OLDER VERSION, STATS RESET`, OLD_SAVE_TOAST_MS)
      show(`LOADED ${slot}`)
    },
    [restore, suspend, resume, show],
  )

  const run = useCallback(
    (task: () => Promise<void>, failure: string) => {
      if (busy.current) return
      busy.current = true
      task()
        .catch(() => show(failure))
        .finally(() => {
          busy.current = false
        })
    },
    [show],
  )

  useEffect(() => {
    if (!emulator || !enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.repeat || typing(event.target)) return
      const slot = slotOf(event.code)
      if (slot === null) return
      event.preventDefault()
      if (event.altKey) run(() => save(emulator, slot), `SAVE ${slot} FAILED`)
      else run(() => load(emulator, slot), `LOAD ${slot} FAILED`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emulator, enabled, save, load, run])

  useEffect(() => {
    const slot = startupSlot(window.location.search)
    if (emulator && slot !== null) run(() => load(emulator, slot), `LOAD ${slot} FAILED`)
  }, [emulator])

  return toast
}
