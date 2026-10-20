import { useCallback, useEffect, useRef, useState } from 'react'
import { PACKAGES, romsOf, type LoadedRom, type PackageRom } from '../packages/registry'
import type { RomInfo } from '../sdk/types'
import { romStore } from './romStore'
import { validateRom } from './validateRom'

const NOT_NES = "That doesn't look like an NES ROM."
const NOT_REMEMBERED = "This browser won't remember the ROM, so you'll pick it again next time."
const STORED_NOTE = 'ROMs are stored locally in this browser and never leave your device.'

const wrongGame = (picked: RomInfo | null, wanted: RomInfo) =>
  picked ? `That file is ${picked.title}, not ${wanted.title}.` : `That file isn't ${wanted.title}.`

const ROMS = romsOf(PACKAGES)

type Props = { active: string | null; onReady: (rom: LoadedRom) => void; onCleared: () => void; onClose: () => void }

export default function RomManager({ active, onReady, onCleared, onClose }: Props) {
  const [stored, setStored] = useState<Map<string, Uint8Array>>(new Map())
  const [message, setMessage] = useState<{ sha1: string; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const targetRef = useRef<PackageRom | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const refresh = useCallback(async () => {
    const found = new Map<string, Uint8Array>()
    for (const bytes of await romStore.loadAll()) {
      const result = await validateRom(bytes)
      if (result.ok) found.set(result.rom.sha1, bytes)
    }
    setStored(found)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const upload = (entry: PackageRom) => {
    targetRef.current = entry
    inputRef.current?.click()
  }

  const choose = async (file: File | undefined) => {
    const wanted = targetRef.current
    if (inputRef.current) inputRef.current.value = ''
    if (!file || !wanted) return
    const { rom, pkg } = wanted
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await validateRom(bytes)
    if (!result.ok || result.rom.sha1 !== rom.sha1) {
      setMessage({ sha1: rom.sha1, text: result.ok ? wrongGame(result.rom, rom) : result.reason === 'not-nes' ? NOT_NES : wrongGame(null, rom) })
      return
    }
    const saved = await romStore.save(bytes, rom.sha1)
    setMessage(saved ? null : { sha1: rom.sha1, text: NOT_REMEMBERED })
    onReady({ bytes, rom, pkg })
    await refresh()
  }

  const use = async ({ rom, pkg }: PackageRom, from = stored) => {
    const bytes = from.get(rom.sha1)
    if (!bytes) return
    await romStore.select(rom.sha1)
    setMessage(null)
    onReady({ bytes, rom, pkg })
  }

  const clear = async ({ rom }: PackageRom) => {
    await romStore.remove(rom.sha1)
    setMessage(null)
    const left = new Map(stored)
    left.delete(rom.sha1)
    setStored(left)
    if (active !== rom.sha1) return
    const [next] = ROMS.filter((other) => left.has(other.rom.sha1))
    if (next) await use(next, left)
    else onCleared()
  }

  return (
    <div className="info-backdrop" onClick={onClose}>
      <div className="info-modal rom-manager" role="dialog" aria-modal="true" aria-labelledby="rom-manager-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="rom-manager-title">GAME SELECTOR</h2>
        <input ref={inputRef} type="file" accept=".nes" aria-label="ROM file" hidden onChange={(event) => choose(event.target.files?.[0])} />
        <ul className="rom-list">
          {ROMS.map((entry) => {
            const { rom } = entry
            const present = stored.has(rom.sha1) || active === rom.sha1
            const inUse = active === rom.sha1
            return (
              <li key={rom.sha1} className="rom-row" data-testid="rom-row">
                <div className="rom-row-text">
                  <span className="info-rom-title">{rom.title}</span>
                  <span className="info-rom-about">{rom.about}</span>
                  <span className={present ? 'rom-status rom-status-present' : 'rom-status'} data-testid="rom-status">
                    {inUse ? 'ACTIVE' : present ? 'STORED' : 'NOT LOADED'}
                  </span>
                  {message?.sha1 === rom.sha1 && <span className="rom-message" role="alert">{message.text}</span>}
                </div>
                <div className="rom-row-actions">
                  {present && !inUse && (
                    <button type="button" data-nav onClick={() => use(entry)}>
                      USE
                    </button>
                  )}
                  {present ? (
                    <button type="button" data-nav aria-label={`Clear ${rom.title}`} onClick={() => clear(entry)}>
                      CLEAR
                    </button>
                  ) : (
                    <button type="button" data-nav aria-label={`Upload ${rom.title}`} onClick={() => upload(entry)}>
                      UPLOAD
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="info-note">{STORED_NOTE}</p>
        <button type="button" data-nav ref={closeRef} onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  )
}
