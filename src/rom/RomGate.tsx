import { useEffect, useRef, useState } from 'react'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

const WRONG_ROM = "That file isn't Tecmo Super Bowl 2026. Pick the roster hack ROM."
const NOT_NES = "That doesn't look like an NES ROM."
const NOT_REMEMBERED = "This browser won't remember the ROM, so you'll pick it again next time."

type Props = { onReady: (rom: Uint8Array) => void; onClear?: () => void; onCancel?: () => void }

export default function RomGate({ onReady, onClear, onCancel }: Props) {
  const [stored, setStored] = useState(false)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    let cancelled = false
    romStore.load().then((rom) => {
      if (cancelled) return
      setLoading(false)
      if (rom) {
        setStored(true)
        onReadyRef.current(rom)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setNote(null)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await validateRom(bytes)
    if (!result.ok) {
      setError(result.reason === 'not-nes' ? NOT_NES : WRONG_ROM)
      return
    }
    const saved = await romStore.save(bytes)
    setStored(saved)
    setPicking(false)
    if (!saved) setNote(NOT_REMEMBERED)
    onReadyRef.current(bytes)
  }

  const clear = async () => {
    await romStore.clear()
    setStored(false)
    setPicking(false)
    setNote(null)
    onClear?.()
  }

  if (loading) return null

  return (
    <div>
      {(!stored || picking) && (
        <label>
          ROM file
          <input type="file" accept=".nes" onChange={(event) => choose(event.target.files?.[0])} />
        </label>
      )}
      {stored && picking && (
        <button type="button" onClick={() => setPicking(false)}>
          Cancel
        </button>
      )}
      {stored && !picking && (
        <>
          <button type="button" onClick={() => setPicking(true)}>
            Replace ROM
          </button>
          <button type="button" onClick={clear}>
            Clear ROM
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {note && <p>{note}</p>}
    </div>
  )
}
