import { useCallback, useEffect, useRef, useState } from 'react'
import { romStore } from './romStore'
import type { LoadedRom } from './profiles'
import RomManager from './RomManager'
import { validateRom } from './validateRom'

type Props = {
  onReady: (rom: LoadedRom) => void
  onClear?: () => void
  primaryLabel: string
  onStart: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  active?: boolean
}

export default function RomGate({ onReady, onClear, primaryLabel, onStart, secondaryLabel, onSecondary, active: focusable = true }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [loading, setLoading] = useState(true)
  const primaryRef = useRef<HTMLButtonElement | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    let cancelled = false
    romStore.load().then(async (bytes) => {
      const result = bytes ? await validateRom(bytes) : null
      if (cancelled) return
      setLoading(false)
      if (bytes && result?.ok) {
        setActive(result.profile.sha1)
        onReadyRef.current({ bytes, profile: result.profile })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (focusable && !loading && !managing) primaryRef.current?.focus()
  }, [focusable, loading, active, managing, primaryLabel])

  const closeManager = useCallback(() => setManaging(false), [])
  const onClearRef = useRef(onClear)
  onClearRef.current = onClear
  const cleared = useCallback(() => {
    setActive(null)
    onClearRef.current?.()
  }, [])

  const ready = (rom: LoadedRom) => {
    setActive(rom.profile.sha1)
    onReadyRef.current(rom)
  }

  if (loading) return null

  return (
    <div className="rom-gate">
      {active === null && (
        <button type="button" data-nav className="start-primary" ref={primaryRef} onClick={() => setManaging(true)}>
          GET STARTED
        </button>
      )}
      {active !== null && (
        <>
          <button type="button" data-nav className="start-primary" ref={primaryRef} onClick={onStart}>
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button type="button" data-nav className="start-secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <div className="rom-options">
            <button type="button" data-nav onClick={() => setManaging(true)}>
              SWITCH GAME
            </button>
          </div>
        </>
      )}
      {managing && <RomManager active={active} onReady={ready} onCleared={cleared} onClose={closeManager} />}
    </div>
  )
}
